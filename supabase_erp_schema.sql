-- ═══════════════════════════════════════════════════════════════════════
-- DDL de Expansão ERP: Imóveis, Clientes e Módulo Financeiro
-- ═══════════════════════════════════════════════════════════════════════
-- Execute este script no SQL Editor do Supabase para criar a estrutura ERP.
-- Script IDEMPOTENTE: pode ser executado várias vezes com segurança.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tabela: public.properties (Imóveis da Imobiliária/Locador)
create table if not exists public.properties (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null,
  type text not null default 'Residencial',
  bedrooms integer default 0,
  bathrooms integer default 0,
  parking integer default 0,
  area numeric default 0,
  rent_value numeric default 0,
  iptu_value numeric default 0,
  condo_value numeric default 0,
  status text not null default 'Disponível',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CEP do imóvel (adicionado depois: idempotente para bases que já criaram a tabela)
alter table public.properties
  add column if not exists cep text;

alter table public.properties enable row level security;

drop policy if exists "properties_select_own" on public.properties;
create policy "properties_select_own" on public.properties for select using (auth.uid() = user_id);

drop policy if exists "properties_insert_own" on public.properties;
create policy "properties_insert_own" on public.properties for insert with check (auth.uid() = user_id);

drop policy if exists "properties_update_own" on public.properties;
create policy "properties_update_own" on public.properties for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "properties_delete_own" on public.properties;
create policy "properties_delete_own" on public.properties for delete using (auth.uid() = user_id);


-- 2. Tabela: public.clients (Pessoas: Locadores, Inquilinos, Fiadores)
create table if not exists public.clients (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  client_type text not null default 'Inquilino', -- 'Inquilino', 'Locador', 'Fiador', 'Cônjuge'
  person_type text not null default 'PF',       -- 'PF' ou 'PJ'
  document text not null,                        -- CPF ou CNPJ
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


-- 3. Tabela: public.financial_records (Lançamentos Financeiros e Repasses)
create table if not exists public.financial_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_id text,
  description text not null,
  tenant_name text,
  landlord_name text,
  due_date text not null,                       -- YYYY-MM-DD
  rent_value numeric not null default 0,
  fee_percent numeric not null default 10,       -- Comissão da Imobiliária (ex: 10%)
  fee_value numeric not null default 0,         -- Valor da Comissão
  net_payout numeric not null default 0,        -- Repasse Líquido ao Locador
  status text not null default 'Pendente',       -- 'Pendente', 'Pago', 'Atrasado'
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
