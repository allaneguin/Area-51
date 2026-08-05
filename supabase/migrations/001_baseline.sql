-- =========================================================================
-- 001_baseline — retrato do banco de produção em 2026-08-05
-- =========================================================================
-- Este arquivo é o PONTO ZERO das migrations. Ele descreve o banco como ele
-- está hoje, consolidando o que os supabase_*.sql da raiz (congelados)
-- deixaram espalhado e divergente.
--
-- QUANDO RODAR:
--   • Provisionar um projeto Supabase NOVO (dev, staging, cópia).
--   • Nunca é necessário rodar em produção: o que está aqui já está lá.
--     É idempotente, então rodar não quebra — mas para CONFERIR produção o
--     certo é ../verificacao.sql, que é somente leitura.
--
-- REGRA DAQUI PRA FRENTE (docs/ARQUITETURA.md R4): este arquivo NUNCA é
-- editado. Toda mudança de banco é um arquivo novo (002_..., 003_...).
-- O banco é a soma das migrations, na ordem.
--
-- DIVERGÊNCIAS DELIBERADAS em relação ao DDL histórico da raiz:
--   1. tenant_links.id é TEXT, não uuid. O DDL antigo dizia uuid e isso
--      derrubou o envio do inquilino em produção ("operator does not exist:
--      text = uuid"). O banco real é text; aqui fica text.
--   2. O e-mail do admin NÃO entra: conceder papel é dado, não estrutura.
--      Ver a seção 7 para o comando manual.
-- =========================================================================


-- ── 1. contracts ─────────────────────────────────────────────────────────
-- fields jsonb é o blob central: partes, valores, prazos, property_id,
-- assinaturas, selfie e a trilha de aceite (IP/GPS/hash/user agent).
create table if not exists public.contracts (
  id text primary key,                    -- gerado no cliente (Utils.generateId)
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  template_id text not null,
  fields jsonb not null default '{}'::jsonb,
  is_finalized boolean not null default false,
  cloud_id uuid,                          -- aponta para tenant_links.id (text com uuid válido:
                                          -- o cliente usa crypto.randomUUID, então os tipos convivem)
  cloud_key text,                         -- chave AES do link, em claro (risco aceito — ver ARQUITETURA §7)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contracts enable row level security;

drop policy if exists "contracts_select_own" on public.contracts;
create policy "contracts_select_own"
  on public.contracts for select
  using (auth.uid() = user_id);

drop policy if exists "contracts_insert_own" on public.contracts;
create policy "contracts_insert_own"
  on public.contracts for insert
  with check (auth.uid() = user_id);

drop policy if exists "contracts_update_own" on public.contracts;
create policy "contracts_update_own"
  on public.contracts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "contracts_delete_own" on public.contracts;
create policy "contracts_delete_own"
  on public.contracts for delete
  using (auth.uid() = user_id);


-- ── 2. profiles ──────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  profile_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Sem política de DELETE: a exclusão da conta passa por delete_own_account().


-- ── 3. tenant_links ──────────────────────────────────────────────────────
-- Guarda SÓ o texto cifrado (AES-GCM feito no navegador). O servidor nunca
-- vê o conteúdo. Acesso exclusivamente pelas 3 funções da seção 6:
-- RLS ligada + ZERO políticas + revoke = negado por padrão.
create table if not exists public.tenant_links (
  -- TEXT de propósito (ver cabeçalho). Sem default: o id sempre vem do
  -- cliente, via CSPRNG. Um default herdado, se existir, é inócuo.
  id text primary key,
  encrypted_payload text not null,
  finalized boolean not null default false,
  created_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

-- Bases anteriores ao endurecimento de 30/07 não tinham created_by.
alter table public.tenant_links
  add column if not exists created_by uuid references auth.users(id) on delete cascade;

-- Retenção de 30 dias (era 90). Link não assinado carrega CPF, RG e dados
-- bancários do locador — não há motivo para três meses.
alter table public.tenant_links
  alter column expires_at set default (now() + interval '30 days');

-- Teto de 512 KB imposto pelo banco, valendo para qualquer caminho.
-- NOT VALID de propósito: vale para o que for gravado daqui em diante e não
-- rejeita linha antiga fora do padrão (o script nunca falha por isso).
alter table public.tenant_links drop constraint if exists tenant_links_payload_max;
alter table public.tenant_links
  add constraint tenant_links_payload_max
  check (length(encrypted_payload) <= 524288) not valid;

create index if not exists tenant_links_created_by_idx
  on public.tenant_links (created_by, created_at desc);

-- Sem este índice o expurgo varre a tabela toda.
create index if not exists tenant_links_expires_at_idx
  on public.tenant_links (expires_at);

-- A porta dos fundos fica fechada: nenhuma política, nenhum privilégio direto.
drop policy if exists "tenant_links_select_by_id" on public.tenant_links;
drop policy if exists "tenant_links_insert"       on public.tenant_links;
drop policy if exists "tenant_links_update_by_id" on public.tenant_links;

revoke all on table public.tenant_links from anon, authenticated;
alter table public.tenant_links enable row level security;


-- ── 4. ERP: properties, clients, financial_records ───────────────────────
-- Diferente de contracts: colunas tipadas, sem blob JSON.
create table if not exists public.properties (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null,
  cep text,
  type text not null default 'Residencial',
  bedrooms integer default 0,
  bathrooms integer default 0,
  parking integer default 0,
  area numeric default 0,
  rent_value numeric default 0,
  iptu_value numeric default 0,
  condo_value numeric default 0,
  status text not null default 'Disponível',   -- 'Alugado' é derivado do contrato ativo, no cliente
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bases que criaram properties antes do cadastro de CEP existir.
alter table public.properties add column if not exists cep text;

alter table public.properties enable row level security;

drop policy if exists "properties_select_own" on public.properties;
create policy "properties_select_own" on public.properties for select using (auth.uid() = user_id);

drop policy if exists "properties_insert_own" on public.properties;
create policy "properties_insert_own" on public.properties for insert with check (auth.uid() = user_id);

drop policy if exists "properties_update_own" on public.properties;
create policy "properties_update_own" on public.properties for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "properties_delete_own" on public.properties;
create policy "properties_delete_own" on public.properties for delete using (auth.uid() = user_id);


create table if not exists public.clients (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  client_type text not null default 'Inquilino',  -- 'Inquilino', 'Locador', 'Fiador', 'Cônjuge'
  person_type text not null default 'PF',         -- 'PF' ou 'PJ'
  document text not null,                         -- CPF ou CNPJ: chave de deduplicação do cadastro automático
  rg text,
  phone text,
  email text,
  address text,
  profession text,
  income numeric default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own" on public.clients for select using (auth.uid() = user_id);

drop policy if exists "clients_insert_own" on public.clients;
create policy "clients_insert_own" on public.clients for insert with check (auth.uid() = user_id);

drop policy if exists "clients_update_own" on public.clients;
create policy "clients_update_own" on public.clients for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "clients_delete_own" on public.clients;
create policy "clients_delete_own" on public.clients for delete using (auth.uid() = user_id);


create table if not exists public.financial_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_id text,                               -- vínculo lógico com contracts.id, sem FK
  description text not null,
  tenant_name text,
  landlord_name text,
  due_date text not null,                         -- YYYY-MM-DD (text, não date)
  rent_value numeric not null default 0,
  fee_percent numeric not null default 10,        -- comissão da imobiliária
  fee_value numeric not null default 0,
  net_payout numeric not null default 0,          -- repasse líquido ao locador
  status text not null default 'Pendente',        -- 'Pendente', 'Pago', 'Atrasado'
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_records enable row level security;

drop policy if exists "financial_select_own" on public.financial_records;
create policy "financial_select_own" on public.financial_records for select using (auth.uid() = user_id);

drop policy if exists "financial_insert_own" on public.financial_records;
create policy "financial_insert_own" on public.financial_records for insert with check (auth.uid() = user_id);

drop policy if exists "financial_update_own" on public.financial_records;
create policy "financial_update_own" on public.financial_records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "financial_delete_own" on public.financial_records;
create policy "financial_delete_own" on public.financial_records for delete using (auth.uid() = user_id);


-- ── 5. Supervisão (admin) ────────────────────────────────────────────────
-- O papel vem do claim "role" em app_metadata, que SÓ o painel/service role
-- edita — o usuário nunca se autopromove (diferente de user_metadata e de
-- profiles.profile_data, que ele controla). Políticas de RLS são OR entre
-- si: usuário comum continua vendo apenas o que é dele.
-- Somente leitura de propósito: admin supervisiona, não edita.
drop policy if exists "contracts_select_admin" on public.contracts;
create policy "contracts_select_admin"
  on public.contracts for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Nota: properties, clients e financial_records NÃO têm política de admin —
-- o painel de supervisão não enxerga o ERP. É o estado atual; se for para
-- mudar, é decisão de produto e vira uma migration nova.


-- ── 6. Funções ───────────────────────────────────────────────────────────
-- Todas SECURITY DEFINER com search_path fixo: é o que permite operar sobre
-- tenant_links com a tabela fechada.
-- Os drops cobrem as assinaturas antigas (p_id uuid), que conviviam com as
-- novas e causavam "operator does not exist: text = uuid".

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
  -- Expurgo na leitura: não depende de extensão nenhuma, e o índice de
  -- expires_at deixa a varredura barata. Sem isto, "retenção de 30 dias"
  -- seria só uma data numa coluna.
  delete from public.tenant_links where expires_at < now();

  -- Devolve inclusive link já finalizado, de propósito: é o que permite ao
  -- inquilino reabrir o que assinou (tela somente leitura) e ao locador
  -- importar. id::text funciona com a coluna sendo text ou uuid.
  select encrypted_payload into v_payload
    from public.tenant_links
   where id::text = p_id and expires_at > now();

  return v_payload;
end;
$$;

revoke all on function public.get_tenant_link(text) from public;
grant execute on function public.get_tenant_link(text) to anon, authenticated;


-- Exclusão da própria conta (LGPD, art. 18). Trava no auth.uid().
-- Os deletes explícitos são de contracts e profiles; properties, clients,
-- financial_records e tenant_links saem pelo cascade da FK em auth.users.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Não autenticado.';
  end if;
  delete from public.contracts where user_id = uid;
  delete from public.profiles  where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;


-- auth.users não é legível pelo cliente. Esta função devolve o mínimo para
-- suporte (e-mail, cadastro, último login) e tem portão interno: fora do
-- admin, retorna vazio. O revoke existe porque o Postgres concede EXECUTE a
-- PUBLIC por padrão, e anon herda de PUBLIC.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    return;
  end if;

  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at
      from auth.users u;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;


-- ── 7. Expurgo agendado, se o pg_cron existir ────────────────────────────
-- Condicional: em projeto sem a extensão, apenas avisa. O expurgo na leitura
-- (get_tenant_link) já cobre o caso — este bloco é a rede de segurança para
-- links que nunca mais forem abertos.
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
    raise notice 'pg_cron ausente neste projeto: o expurgo acontece na leitura de cada link.';
  end if;
end $$;


-- =========================================================================
-- PASSO MANUAL (não entra em migration): conceder o papel de admin.
-- É dado, não estrutura — versionar o e-mail daria admin a quem tivesse
-- aquele endereço num projeto novo. Rode no SQL Editor, uma vez por admin,
-- e peça para a pessoa deslogar e logar (o JWT só muda no login):
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                              || '{"role":"admin"}'::jsonb
--    where email = 'ENDERECO@EXEMPLO.COM';
--
-- Para revogar:
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'role'
--    where email = 'ENDERECO@EXEMPLO.COM';
-- =========================================================================
