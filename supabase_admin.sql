-- CONGELADO (2026-08-05) — REGISTRO HISTÓRICO. NÃO EXECUTAR.
-- Este arquivo não regride segurança, mas está congelado como os demais:
-- mudança de banco daqui pra frente é só via supabase/migrations/ (novo
-- arquivo numerado). Ver docs/ARQUITETURA.md (regra R4).
-- ═══════════════════════════════════════════════════════════════════════
-- Papel de administrador (visão de todas as contas) — Meus Imóveis
-- ═══════════════════════════════════════════════════════════════════════
-- Cole e execute este script no SQL Editor do painel do Supabase.
-- Ele é IDEMPOTENTE: pode ser executado mais de uma vez sem erro.
--
-- Modelo:
--   • O papel vem do app_metadata do usuário (claim "role" = "admin").
--     app_metadata SÓ é editável pelo painel/service role — o usuário
--     NUNCA consegue se autopromover pelo cliente (diferente do
--     user_metadata e do profiles.profile_data, que ele controla).
--   • Admin ganha SELECT extra em contracts e profiles. Políticas de RLS
--     são OR entre si: usuário comum segue vendo só o que é dele.
--   • Só leitura de propósito: admin supervisiona as ilhas, não edita.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Conceder o papel (rode UMA VEZ por admin, ajustando o e-mail).
--    O usuário precisa deslogar e logar de novo para o JWT novo valer.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where email = 'adm@gmail.com';

-- Para revogar:
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where email = '...';

-- 2) Políticas de leitura para o admin
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

-- Observações:
--   • Sem políticas de INSERT/UPDATE/DELETE para admin: a supervisão é
--     somente leitura. Se um dia precisar editar, crie política explícita.
--   • tenant_links fica de fora: o payload é cifrado no navegador e
--     ilegível de qualquer forma.


-- ═══════════════════════════════════════════════════════════════════════
-- 3) Dados da conta (e-mail, cadastro, último login) para SUPORTE
-- ───────────────────────────────────────────────────────────────────────
-- auth.users NÃO é legível pelo cliente (nem por RLS) — é uma tabela do
-- schema auth. Para o admin ver o e-mail/datas de cada conta, expomos uma
-- função SECURITY DEFINER (roda com privilégio do dono) que só devolve algo
-- se quem chama for admin. Resolve para TODAS as contas de uma vez, antigas
-- inclusive — não depende de gravar e-mail no cadastro.
-- ═══════════════════════════════════════════════════════════════════════
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
  -- Portão: fora do admin, devolve vazio (nunca vaza auth.users).
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    return;
  end if;

  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at
      from auth.users u;
end;
$$;

-- O Postgres concede EXECUTE a PUBLIC por padrão em toda função nova, e `anon`
-- herda de PUBLIC — sem o revoke abaixo, esta função SECURITY DEFINER ficaria
-- exposta em /rest/v1/rpc sem sessão. O portão interno já devolve vazio, mas a
-- superfície não deve existir.
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
