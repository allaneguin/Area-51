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
