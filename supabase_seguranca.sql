-- ⛔ CONGELADO (2026-08-05) — este arquivo é a VERSÃO VIGENTE das regras de
-- tenant_links, já aplicada em produção em 30/07. Não reexecutar por rotina.
-- Mudança de banco daqui pra frente: novo arquivo em supabase/migrations/.
-- Para conferir o banco, rode supabase/verificacao.sql (somente leitura).
-- Ver docs/ARQUITETURA.md (§8 e regra R4).
-- =========================================================================
-- CERCA DE SEGURANÇA — rode este arquivo inteiro no SQL Editor do Supabase.
--
-- Consolida e substitui as regras de tenant_links que estavam divididas (e
-- divergentes) entre supabase_schema.sql, supabase_rls.sql e
-- supabase_finalize.sql.
--
-- O QUE FECHA:
--   1. A tabela era LISTÁVEL inteira por qualquer um com a chave pública
--      (a regra de leitura não filtrava por id).
--   2. Era GRAVÁVEL sem a chave de criptografia (with check true), o que
--      permitia sobrescrever contrato em andamento e reverter a trava.
--   3. Aceitava INSERT anônimo sem limite de tamanho — no plano Free, o
--      jeito mais barato de encher os 500 MB e derrubar o sistema.
--
-- Depois disto, o visitante anônimo não fala mais com a tabela: só com as
-- três funções, que filtram por identificador. Elas rodam com privilégio de
-- dono (SECURITY DEFINER), então continuam funcionando com a tabela fechada.
--
-- SEGURO DE RODAR: idempotente (pode repetir), não apaga nenhum dado, e se
-- adapta ao estado atual sem precisar de diagnóstico prévio.
-- Links já enviados a inquilinos continuam funcionando.
-- =========================================================================

-- ── 1. Fechar a porta dos fundos ─────────────────────────────────────────
-- Nenhum código do app consulta esta tabela direto — só via as funções.
drop policy if exists "tenant_links_select_by_id" on public.tenant_links;
drop policy if exists "tenant_links_insert"       on public.tenant_links;
drop policy if exists "tenant_links_update_by_id" on public.tenant_links;

revoke all on table public.tenant_links from anon, authenticated;

-- RLS ligada + zero policies = negado por padrão.
alter table public.tenant_links enable row level security;

-- ── 2. Teto de tamanho, imposto pelo banco ───────────────────────────────
-- Vale para qualquer caminho, inclusive quem chamar a função direto sem
-- passar pelo app. Referência: selfie de 600px (~40-80 KB) + duas
-- assinaturas PNG (~5-20 KB) + campos, cifrado e em base64 ≈ 200 KB.
--
-- NOT VALID de propósito: passa a valer para tudo que for gravado daqui em
-- diante, sem checar (nem rejeitar) o que já está gravado. Assim o script
-- nunca falha, mesmo que exista alguma linha antiga fora do padrão.
alter table public.tenant_links drop constraint if exists tenant_links_payload_max;
alter table public.tenant_links
  add constraint tenant_links_payload_max
  check (length(encrypted_payload) <= 524288) not valid;

-- ── 3. Dono do link ──────────────────────────────────────────────────────
-- Habilita o teto por usuário (item 4) e o expurgo em cascata quando a
-- conta é excluída. Links antigos ficam com created_by nulo — não quebra.
alter table public.tenant_links
  add column if not exists created_by uuid references auth.users(id) on delete cascade;

create index if not exists tenant_links_created_by_idx
  on public.tenant_links (created_by, created_at desc);

-- Índice para o expurgo do item 6 não varrer a tabela toda.
create index if not exists tenant_links_expires_at_idx
  on public.tenant_links (expires_at);

-- ── 4. Criar link passa a exigir sessão ──────────────────────────────────
-- O app só gera link de dentro do editor, sempre logado: a permissão para
-- anônimo era herança morta que permitia encher o banco de graça.
-- ATENÇÃO ao tipo de p_id: a coluna tenant_links.id é TEXT neste banco, ainda
-- que o DDL em supabase_schema.sql diga uuid. Declarar p_id como uuid produz
-- "operator does not exist: text = uuid" — o mesmo erro que já quebrou o envio
-- do inquilino em produção. Todas as três funções usam text por isso.
drop function if exists public.create_tenant_link(uuid, text);
drop function if exists public.create_tenant_link(text, text);

create function public.create_tenant_link(p_id text, p_payload text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_hoje integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária para gerar o link do inquilino'
      using errcode = '42501';
  end if;

  if length(p_payload) > 524288 then
    raise exception 'Conteúdo do link acima do limite de 512 KB'
      using errcode = '22001';
  end if;

  -- Disjuntor, não cota comercial: 100/dia está muito acima do uso real de
  -- um escritório e pega conta comprometida ou laço infinito no cliente.
  select count(*) into v_hoje
    from public.tenant_links
   where created_by = v_uid
     and created_at > now() - interval '1 day';

  if v_hoje >= 100 then
    raise exception 'Limite de 100 links por dia atingido. Tente novamente amanhã.'
      using errcode = '54000';
  end if;

  insert into public.tenant_links (id, encrypted_payload, created_by)
  values (p_id, p_payload, v_uid);

  return p_id;
end;
$$;

revoke all on function public.create_tenant_link(text, text) from public, anon;
grant execute on function public.create_tenant_link(text, text) to authenticated;

-- ── 5. set_tenant_link: uma assinatura só ────────────────────────────────
-- Existiam versões com p_id uuid e p_id text. A versão uuid causou
-- "operator does not exist: text = uuid" em produção, porque o cliente
-- manda string. id::text = p_id funciona nos dois casos.
drop function if exists public.set_tenant_link(uuid, text);
drop function if exists public.set_tenant_link(text, text);
drop function if exists public.set_tenant_link(uuid, text, boolean);
drop function if exists public.set_tenant_link(text, text, boolean);

create function public.set_tenant_link(
  p_id       text,
  p_payload  text,
  p_finalize boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_payload) > 524288 then
    raise exception 'Conteúdo do link acima do limite de 512 KB'
      using errcode = '22001';
  end if;

  update public.tenant_links
     set encrypted_payload = p_payload,
         finalized         = finalized or p_finalize,
         -- Ao assinar, a janela cai para 30 dias: tempo de o locador
         -- importar o contrato. Depois disso a selfie, o documento, o IP e
         -- a coordenada somem do servidor (seguem no contrato e no PDF).
         expires_at        = case
                               when p_finalize then least(expires_at, now() + interval '30 days')
                               else expires_at
                             end
   where id::text = p_id
     and expires_at > now()
     and not finalized;

  return found;
end;
$$;

revoke all on function public.set_tenant_link(text, text, boolean) from public;
grant execute on function public.set_tenant_link(text, text, boolean) to anon, authenticated;

-- ── 6. Leitura + expurgo dos expirados ───────────────────────────────────
-- Sem expurgo, "retenção de 30 dias" é só uma data numa coluna: a linha,
-- com selfie, documento, IP e coordenada, ficaria no banco para sempre.
-- Apagar na leitura não depende de extensão nenhuma e o índice do item 3
-- deixa a varredura barata. O item 7 acrescenta o agendamento quando dá.
drop function if exists public.get_tenant_link(uuid);
drop function if exists public.get_tenant_link(text);

create function public.get_tenant_link(p_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload text;
begin
  delete from public.tenant_links where expires_at < now();

  -- Devolve inclusive link já finalizado, de propósito: é o que permite ao
  -- inquilino reabrir e ver o que assinou (a tela fica somente leitura).
  -- id::text funciona com a coluna sendo text (que é o caso aqui) ou uuid.
  select encrypted_payload into v_payload
    from public.tenant_links
   where id::text = p_id and expires_at > now();

  return v_payload;
end;
$$;

revoke all on function public.get_tenant_link(text) from public;
grant execute on function public.get_tenant_link(text) to anon, authenticated;

-- ── 7. Expurgo agendado, se o pg_cron existir ────────────────────────────
-- Bloco condicional: se a extensão não estiver instalada neste projeto, só
-- avisa e segue — o expurgo do item 6 já cobre o caso.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge_expired_tenant_links')
      where exists (select 1 from cron.job where jobname = 'purge_expired_tenant_links');

    perform cron.schedule(
      'purge_expired_tenant_links',
      '15 3 * * *',
      'delete from public.tenant_links where expires_at < now()'
    );
    raise notice 'pg_cron encontrado: expurgo diario agendado para 03:15.';
  else
    raise notice 'pg_cron ausente neste projeto: o expurgo acontece na leitura (item 6).';
  end if;
end $$;

-- ── 8. Retenção padrão: 90 → 30 dias ─────────────────────────────────────
-- Link não assinado carrega CPF, RG e dados bancários do locador. Não há
-- motivo para três meses. Só afeta links criados daqui em diante.
alter table public.tenant_links
  alter column expires_at set default (now() + interval '30 days');
