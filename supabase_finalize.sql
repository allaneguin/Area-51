-- CONGELADO (2026-08-05) — REGISTRO HISTÓRICO. NÃO EXECUTAR.
-- Reexecutar este arquivo REGRIDE a segurança: recria set_tenant_link SEM o
-- teto de 512 KB e SEM a retenção de 30 dias pós-assinatura introduzidos por
-- supabase_seguranca.sql (30/07). Regras vigentes: seguranca.
-- Mudança de banco daqui pra frente: novo arquivo em supabase/migrations/.
-- Ver docs/ARQUITETURA.md (§8 e regra R4).
-- ═══════════════════════════════════════════════════════════════════════
-- Trava do link do inquilino após o envio — Meus Imóveis
-- ═══════════════════════════════════════════════════════════════════════
-- [HISTORICO] Na epoca, este script era colado no SQL Editor. NAO EXECUTE HOJE.
-- Ele é IDEMPOTENTE: pode ser executado mais de uma vez sem erro.
--
-- Problema que resolve: a política de UPDATE de tenant_links era
-- "with check (true)" enquanto o link não expirasse. Qualquer pessoa com a
-- URL podia REESCREVER os dados do inquilino mesmo depois do envio (um link
-- encaminhado no WhatsApp bastava). Depois desta migração, o envio do
-- inquilino marca finalized=true e o link vira somente leitura.
--
-- ATENÇÃO: o DDL original das RPCs não está versionado no repositório
-- (ver README). Este script assume:
--   • tabela public.tenant_links(id uuid, encrypted_payload text,
--     expires_at timestamptz, ...)
--   • RPC set_tenant_link(p_id uuid, p_payload text) existente.
-- Se os nomes/tipos divergirem no seu projeto, ajuste antes de rodar.
-- O app continua funcionando ANTES da migração (fallback no cliente), mas a
-- trava só existe DEPOIS de rodar este script.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Coluna de trava
alter table public.tenant_links
  add column if not exists finalized boolean not null default false;

-- 2) Política de UPDATE: link finalizado não aceita mais escrita direta
drop policy if exists "tenant_links_update_by_id" on public.tenant_links;
create policy "tenant_links_update_by_id"
  on public.tenant_links for update
  to anon, authenticated
  using (expires_at > now() and not finalized)
  with check (true);

-- 3) RPC com o argumento p_finalize.
-- Remove as sobrecargas antigas primeiro: "create or replace" com assinatura
-- nova NÃO substitui a antiga — criaria ambiguidade na chamada via PostgREST.
drop function if exists public.set_tenant_link(uuid, text);
drop function if exists public.set_tenant_link(text, text);
drop function if exists public.set_tenant_link(uuid, text, boolean);
drop function if exists public.set_tenant_link(text, text, boolean);

-- p_id é TEXT e a comparação faz cast da coluna (id::text): funciona com a
-- coluna id sendo text OU uuid. A versão anterior declarava p_id uuid e
-- quebrava com "operator does not exist: text = uuid" quando a coluna é text.
create or replace function public.set_tenant_link(
  p_id text,
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
   where id::text = p_id
     and expires_at > now()
     and not finalized;          -- link enviado é somente leitura
  return found;                  -- false = expirado, inexistente ou já enviado
end;
$$;

grant execute on function public.set_tenant_link(text, text, boolean) to anon, authenticated;

-- Observação: get_tenant_link segue lendo links finalizados de propósito —
-- é assim que o locador importa os dados pelo link de retorno (#import).
