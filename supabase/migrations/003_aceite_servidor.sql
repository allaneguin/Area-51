-- =========================================================================
-- 003 — evidencia do aceite carimbada pelo servidor + prova de posse da chave
-- =========================================================================
-- Fecha dois achados da revisao de 07/08. Os dois tem a mesma raiz: o servidor
-- trata o link como um blob opaco e nunca verificou nada sobre ele.
--
-- PROBLEMA 1 — a trilha de auditoria e escrita por quem assina.
--   aceite_ts, ip_acesso, geo_lat/lng e aceite_hash sao gravados no navegador
--   do inquilino e viajam DENTRO do payload cifrado. O certificado do PDF
--   imprime esses valores sob o titulo "EVIDENCIAS TECNICAS E TRILHA DE
--   AUDITORIA", citando MP 2.200-2/2001 e Lei 14.063/2020 — mas quem assina
--   escolhe a data, o IP e a coordenada em uma linha de console. A prova que
--   deveria valer CONTRA o signatario e redigida por ele.
--
-- PROBLEMA 2 — escrever no link exige so o id, nao a chave.
--   O WHERE de set_tenant_link era "id + nao expirado + nao finalizado". Quem
--   tivesse so o id (link encaminhado em grupo, print cortado, historico do
--   navegador) sobrescrevia o payload e marcava finalized=true de uma aba
--   anonima, sem sessao. Nenhuma funcao des-finaliza e a tabela nao tem
--   politica de UPDATE, entao nem o locador dono conseguia consertar: se o
--   inquilino ja tinha enviado, a selfie, o IP e as coordenadas sumiam.
--
-- DESENHO DA PROVA DE POSSE: o cliente manda SHA-256(chave) e o servidor
-- guarda SHA-256(SHA-256(chave)). O servidor NUNCA aprende a chave — a
-- propriedade que sustenta o modelo (a tabela sozinha nao decifra nada)
-- continua de pe — e quem nao tem a chave nao escreve. sha256() e built-in
-- do Postgres 11+; nao precisa de pgcrypto nem de dependencia nova.
--
-- COMPATIBILIDADE — leia antes de rodar:
--   1. Os parametros novos entram com DEFAULT NULL e as assinaturas antigas
--      sao derrubadas. Chamada por nome (que e como o PostgREST chama)
--      continua resolvendo para a funcao nova. Ou seja: RODAR ESTA MIGRATION
--      COM O JS ANTIGO NO AR NAO QUEBRA NADA. O JS novo vem depois.
--   2. Links criados ANTES desta migration ficam com key_proof null e seguem
--      aceitando escrita so com o id, ate expirarem (no maximo 30 dias). Nao
--      da para exigir a prova deles sem quebrar inquilino que esta com o link
--      na mao agora. Eram 18 links vivos em 07/08.
--   3. get_tenant_link continua devolvendo TEXT (so o payload). A evidencia
--      do servidor sai por uma funcao separada, de proposito: mudar o tipo de
--      retorno quebraria o JS em producao no instante em que a migration
--      rodasse.
--
-- ORDEM: rode esta migration ANTES de publicar o JS novo (ver item 1).
-- Depois rode supabase/verificacao.sql.
-- =========================================================================

begin;

-- ── 1. Colunas novas ─────────────────────────────────────────────────────
-- key_proof: SHA-256(SHA-256(chave)), hex. Null = link legado (ver item 2).
-- finalized_at/finalized_ip: o carimbo que o signatario nao escreve.
alter table public.tenant_links add column if not exists key_proof    text;
alter table public.tenant_links add column if not exists finalized_at timestamptz;
alter table public.tenant_links add column if not exists finalized_ip text;


-- ── 2. create_tenant_link: grava a prova ─────────────────────────────────
drop function if exists public.create_tenant_link(text, text);
drop function if exists public.create_tenant_link(text, text, text);

create function public.create_tenant_link(
  p_id        text,
  p_payload   text,
  p_key_proof text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid   uuid := auth.uid();
  v_hoje  integer;
  v_bytes bigint;
begin
  if v_uid is null then
    raise exception 'Sessão necessária para gerar o link do inquilino'
      using errcode = '42501';
  end if;

  if length(p_payload) > 524288 then
    raise exception 'Conteúdo do link acima do limite de 512 KB'
      using errcode = '22001';
  end if;

  -- Formato conferido aqui para o erro sair cedo e legivel. Null e aceito de
  -- proposito: e o JS antigo, que ainda nao manda a prova (ver cabecalho).
  if p_key_proof is not null and p_key_proof !~ '^[0-9a-f]{64}$' then
    raise exception 'Prova de posse da chave malformada'
      using errcode = '22023';
  end if;

  -- Disjuntor de TAXA, não cota comercial: 100/dia está muito acima do uso
  -- real de um escritório e pega conta comprometida ou laço no cliente.
  select count(*) into v_hoje
    from public.tenant_links
   where created_by = v_uid
     and created_at > now() - interval '1 day';

  if v_hoje >= 100 then
    raise exception 'Limite de 100 links por dia atingido. Tente novamente amanhã.'
      using errcode = '54000';
  end if;

  -- Disjuntor de ARMAZENAMENTO. O teto por link (512 KB) e o de taxa
  -- (100/dia) nao limitavam o total: 100 x 512 KB x 30 dias de retencao dava
  -- ~1,5 GB por usuario, o triplo da cota do plano que eles deveriam
  -- proteger. Um usuario sozinho estourava o projeto em ~10 dias sem violar
  -- regra nenhuma.
  select coalesce(sum(length(encrypted_payload)), 0) into v_bytes
    from public.tenant_links
   where created_by = v_uid;

  if v_bytes + length(p_payload) > 52428800 then
    raise exception 'Cota de 50 MB em links ativos atingida. Aguarde os links antigos expirarem.'
      using errcode = '54000';
  end if;

  insert into public.tenant_links (id, encrypted_payload, created_by, key_proof)
  values (
    p_id,
    p_payload,
    v_uid,
    case when p_key_proof is null
         then null
         else encode(sha256(convert_to(p_key_proof, 'UTF8')), 'hex')
    end
  );

  return p_id;
end;
$$;

revoke all on function public.create_tenant_link(text, text, text) from public, anon;
grant execute on function public.create_tenant_link(text, text, text) to authenticated;


-- ── 3. set_tenant_link: exige a prova e carimba o aceite ─────────────────
drop function if exists public.set_tenant_link(text, text, boolean);
drop function if exists public.set_tenant_link(text, text, boolean, text);

create function public.set_tenant_link(
  p_id        text,
  p_payload   text,
  p_finalize  boolean default false,
  p_key_proof text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ip text;
begin
  if length(p_payload) > 524288 then
    raise exception 'Conteúdo do link acima do limite de 512 KB'
      using errcode = '22001';
  end if;

  -- IP visto pelo PostgREST, nao o que o cliente diz que e. x-forwarded-for
  -- pode vir como lista ("cliente, proxy1, proxy2"): o primeiro e a origem.
  v_ip := nullif(
    split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      ',', 1
    ),
    ''
  );

  update public.tenant_links
     set encrypted_payload = p_payload,
         finalized         = finalized or p_finalize,
         -- Carimbo do servidor: so na finalizacao, e so na primeira (o
         -- WHERE ja barra reescrita de link finalizado, mas explicitar aqui
         -- deixa a intencao obvia para quem mexer depois).
         finalized_at      = case when p_finalize then now()  else finalized_at end,
         finalized_ip      = case when p_finalize then v_ip   else finalized_ip end,
         -- Ao assinar, a janela cai para 30 dias: tempo de o locador
         -- importar o contrato. Depois disso a selfie, o documento, o IP e
         -- a coordenada somem do servidor (seguem no contrato e no PDF).
         expires_at        = case
                               when p_finalize then least(expires_at, now() + interval '30 days')
                               else expires_at
                             end
   where id::text = p_id
     and expires_at > now()
     and not finalized
     -- A chave passa a fazer parte da autorizacao. key_proof null = link
     -- criado antes desta migration: mantem o comportamento antigo ate
     -- expirar, senao o inquilino que esta com o link na mao agora perderia
     -- o que digitou.
     and (
       key_proof is null
       or key_proof = encode(sha256(convert_to(coalesce(p_key_proof, ''), 'UTF8')), 'hex')
     );

  return found;
end;
$$;

revoke all on function public.set_tenant_link(text, text, boolean, text) from public;
grant execute on function public.set_tenant_link(text, text, boolean, text) to anon, authenticated;


-- ── 4. get_tenant_link: sem DELETE, e agora imutavel na leitura ──────────
-- A funcao aberta a anon executava um DELETE a cada chamada: transacao de
-- escrita, WAL e commit por requisicao, sem contencao nenhuma — o caminho
-- mais barato para pressionar o banco sem ter conta. O pg_cron esta instalado
-- neste projeto (confirmado em 07/08), entao o expurgo vive no agendamento da
-- secao 6, que e a rede primaria.
--
-- O RETORNO CONTINUA TEXT de proposito: mudar para "returns table" quebraria
-- o CloudDB.loadContract em producao no instante em que esta migration
-- rodasse. A evidencia sai pela funcao da secao 5.
create or replace function public.get_tenant_link(p_id text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  -- Devolve inclusive link ja finalizado, de proposito: e o que permite ao
  -- inquilino reabrir o que assinou (tela somente leitura) e ao locador
  -- importar. id::text funciona com a coluna sendo text ou uuid.
  select encrypted_payload
    from public.tenant_links
   where id::text = p_id
     and expires_at > now();
$$;

revoke all on function public.get_tenant_link(text) from public;
grant execute on function public.get_tenant_link(text) to anon, authenticated;


-- ── 5. A evidencia do servidor, separada do payload ──────────────────────
-- Funcao propria em vez de mudar o retorno de get_tenant_link (ver secao 4).
-- Aberta a anon pelo mesmo motivo que get_tenant_link e: quem tem o id ja tem
-- o conteudo do link, e isto devolve estritamente menos do que aquilo.
create or replace function public.get_tenant_link_evidencia(p_id text)
returns table (
  finalizado_em timestamptz,
  finalizado_ip text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select t.finalized_at, t.finalized_ip
    from public.tenant_links t
   where t.id::text = p_id
     and t.expires_at > now();
$$;

revoke all on function public.get_tenant_link_evidencia(text) from public;
grant execute on function public.get_tenant_link_evidencia(text) to anon, authenticated;


-- ── 6. Expurgo agendado (agora e o unico caminho) ────────────────────────
-- Reagenda de forma idempotente. Deixou de ser rede de seguranca e passou a
-- ser o mecanismo principal, porque a secao 4 tirou o DELETE da leitura.
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
    raise notice '003: expurgo diario reagendado para 03:15.';
  else
    -- Nao deveria acontecer neste projeto (checado em 07/08). Se acontecer, a
    -- retencao de 30 dias vira so uma data numa coluna: sem o cron e sem o
    -- DELETE da leitura, nada apaga link expirado.
    raise exception '003: pg_cron ausente — reponha o expurgo antes de aplicar a secao 4';
  end if;
end $$;

commit;
