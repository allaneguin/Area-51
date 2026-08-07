-- CONGELADO (2026-08-05) — REGISTRO HISTÓRICO. NÃO EXECUTAR.
-- Reexecutar este arquivo REGRIDE a segurança: recria políticas e RPCs
-- antigas de tenant_links (enumeração/escrita anônima, 90 dias, grant a anon)
-- que supabase_seguranca.sql (30/07) eliminou. Regras vigentes: seguranca.
-- Mudança de banco daqui pra frente: novo arquivo em supabase/migrations/.
-- Ver docs/ARQUITETURA.md (§8 e regra R4).
-- ═══════════════════════════════════════════════════════════════════════
-- DDL Completo e Políticas de Segurança (RLS) — Meus Imóveis
-- ═══════════════════════════════════════════════════════════════════════
-- [HISTORICO] Inicializava a estrutura. Hoje isso e migrations/001. NAO EXECUTE.
-- Script IDEMPOTENTE: pode ser executado várias vezes sem provocar erros.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tabela: public.contracts
create table if not exists public.contracts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  template_id text not null,
  fields jsonb not null default '{}'::jsonb,
  is_finalized boolean not null default false,
  cloud_id uuid,
  cloud_key text,
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


-- 2. Tabela: public.profiles
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


-- 3. Tabela: public.tenant_links
create table if not exists public.tenant_links (
  id uuid primary key default gen_random_uuid(),
  encrypted_payload text not null,
  finalized boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

alter table public.tenant_links enable row level security;

drop policy if exists "tenant_links_select_by_id" on public.tenant_links;
create policy "tenant_links_select_by_id"
  on public.tenant_links for select
  to anon, authenticated
  using (expires_at > now());

drop policy if exists "tenant_links_insert" on public.tenant_links;
create policy "tenant_links_insert"
  on public.tenant_links for insert
  to anon, authenticated
  with check (true);

drop policy if exists "tenant_links_update_by_id" on public.tenant_links;
create policy "tenant_links_update_by_id"
  on public.tenant_links for update
  to anon, authenticated
  using (expires_at > now() and not finalized)
  with check (true);


-- 4. Funções RPC
create or replace function public.create_tenant_link(
  p_id uuid,
  p_payload text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_links (id, encrypted_payload)
  values (p_id, p_payload);
  return p_id;
end;
$$;

grant execute on function public.create_tenant_link(uuid, text) to anon, authenticated;

create or replace function public.set_tenant_link(
  p_id uuid,
  p_payload text,
  p_finalize boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenant_links
     set encrypted_payload = p_payload,
         finalized = finalized or p_finalize
   where id = p_id
     and expires_at > now()
     and not finalized;
  return found;
end;
$$;

grant execute on function public.set_tenant_link(uuid, text, boolean) to anon, authenticated;

create or replace function public.get_tenant_link(
  p_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload text;
begin
  select encrypted_payload into v_payload
    from public.tenant_links
   where id = p_id
     and expires_at > now();
  return v_payload;
end;
$$;

grant execute on function public.get_tenant_link(uuid) to anon, authenticated;
