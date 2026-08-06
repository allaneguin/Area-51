-- CONGELADO (2026-08-05) — REGISTRO HISTÓRICO. NÃO EXECUTAR.
-- Reexecutar este arquivo REGRIDE a segurança: recria as políticas antigas
-- de tenant_links (leitura sem filtro por id, update com check true, 90 dias)
-- que supabase_seguranca.sql (30/07) eliminou. Regras vigentes: seguranca.
-- Mudança de banco daqui pra frente: novo arquivo em supabase/migrations/.
-- Ver docs/ARQUITETURA.md (§8 e regra R4).
-- ═══════════════════════════════════════════════════════════════════════
-- Políticas de Segurança (RLS) — Meus Imóveis
-- ═══════════════════════════════════════════════════════════════════════
-- Cole e execute este script no SQL Editor do painel do Supabase.
-- Ele é IDEMPOTENTE: pode ser executado mais de uma vez sem erro.
--
-- Modelo de segurança:
--   • contracts / profiles  -> privados, só o dono (auth.uid()) acessa.
--   • tenant_links          -> acessíveis de forma anônima APENAS por id
--                              (o id UUID + a chave na URL funcionam como
--                              "bearer token"; o payload é criptografado
--                              no cliente via AES-GCM antes de subir).
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- Tabela: contracts
-- (Confirme que a coluna id é TEXT, pois o app gera ids não-UUID
--  via Utils.generateId(). Se for uuid, a migração local->nuvem falha.)
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- Tabela: profiles  (id = auth.uid() do dono)
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- Tabela: tenant_links
-- Acesso anônimo controlado pelo conhecimento do id (UUID) + chave na URL.
-- O payload é criptografado no cliente, então o backend nunca vê os dados.
-- Recomendado: coluna de expiração para links não viverem para sempre.
-- ─────────────────────────────────────────────

-- (Opcional, mas recomendado) coluna de expiração — 90 dias por padrão.
alter table public.tenant_links
  add column if not exists expires_at timestamptz not null default (now() + interval '90 days');

alter table public.tenant_links enable row level security;

-- Leitura: qualquer um (anon/authenticated) que saiba o id, desde que não expirado.
drop policy if exists "tenant_links_select_by_id" on public.tenant_links;
create policy "tenant_links_select_by_id"
  on public.tenant_links for select
  to anon, authenticated
  using (expires_at > now());

-- Inserção: permitida (o locador cria o link). O id é gerado no cliente.
drop policy if exists "tenant_links_insert" on public.tenant_links;
create policy "tenant_links_insert"
  on public.tenant_links for insert
  to anon, authenticated
  with check (true);

-- Atualização: o inquilino preenche e reenvia o payload (link ainda válido).
-- `not finalized` é obrigatório: sem ele, quem tiver a URL reescreve os dados de
-- um contrato já enviado. Mantenha idêntico ao de supabase_schema.sql /
-- supabase_finalize.sql — este script roda por último e sobrescreve a política.
alter table public.tenant_links
  add column if not exists finalized boolean not null default false;

drop policy if exists "tenant_links_update_by_id" on public.tenant_links;
create policy "tenant_links_update_by_id"
  on public.tenant_links for update
  to anon, authenticated
  using (expires_at > now() and not finalized)
  with check (true);

-- Observação: sem política de DELETE para anônimos (links não podem ser apagados
-- por terceiros). A limpeza de expirados é feita pelo job de cron abaixo.


-- ─────────────────────────────────────────────
-- Exclusão da própria conta (LGPD, art. 18)
-- SECURITY DEFINER é necessário para apagar a linha de auth.users;
-- o corpo trava no auth.uid() e o EXECUTE fica só com "authenticated".
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- Retenção (LGPD, art. 15/16): apaga diariamente os links expirados.
-- cron.schedule com o mesmo nome atualiza o job — idempotente.
-- ─────────────────────────────────────────────
create extension if not exists pg_cron;
select cron.schedule(
  'purge_expired_tenant_links',
  '15 3 * * *',
  $job$ delete from public.tenant_links where expires_at < now() $job$
);
