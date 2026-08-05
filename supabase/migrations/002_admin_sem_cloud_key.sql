-- =========================================================================
-- 002 — o admin deixa de enxergar contracts.cloud_key
-- =========================================================================
-- PROBLEMA: a política "contracts_select_admin" (001, seção 5) libera SELECT
-- na tabela inteira, sem restringir colunas. Isso inclui cloud_key — a chave
-- AES dos links do inquilino.
--
-- Por que isso é pior do que parece: cloud_key não é só mais um dado pessoal,
-- é uma CREDENCIAL. Com cloud_id + cloud_key qualquer um chama get_tenant_link
-- (executável por anon) de fora do sistema e decifra o payload, sem sessão
-- nenhuma. Uma conta de admin comprometida vazaria não apenas o que ela já vê
-- na tela, mas bearer tokens utilizáveis anonimamente até o link expirar.
--
-- Por que não dá para resolver com GRANT por coluna: o dono PRECISA ler o
-- próprio cloud_key (o editor regenera e atualiza links). Um
-- "revoke select (cloud_key) ... from authenticated" quebraria o locador
-- junto com o admin — grants são por papel, e ambos são 'authenticated'.
--
-- SOLUÇÃO: trocar a política por uma função SECURITY DEFINER que devolve
-- apenas as colunas de supervisão. Mesmo padrão já usado em admin_list_users.
--
-- ORDEM DE APLICAÇÃO: rode este SQL ANTES de publicar o JS novo. Nessa ordem
-- o painel falha para o lado seguro (o admin passa a ver só os próprios
-- contratos até o deploy sair); na ordem inversa ele quebra com erro de
-- função inexistente. É console interno, a janela é curta nos dois casos.
-- =========================================================================

create or replace function public.admin_list_contracts()
returns table (
  user_id uuid,
  name text,
  fields jsonb,
  is_finalized boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mesmo portão de admin_list_users: fora do admin, devolve vazio.
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    return;
  end if;

  -- cloud_key e cloud_id ficam de fora de propósito: são a credencial do
  -- link, não dado de supervisão. O painel nunca precisou deles.
  return query
    select c.user_id, c.name, c.fields, c.is_finalized, c.created_at, c.updated_at
      from public.contracts c;
end;
$$;

revoke execute on function public.admin_list_contracts() from public, anon;
grant execute on function public.admin_list_contracts() to authenticated;

-- Agora a leitura global do admin passa só pela função acima.
-- A política de profiles CONTINUA: profile_data é o cadastro do próprio
-- locador, não guarda credencial, e o painel precisa dele para identificar
-- a conta.
drop policy if exists "contracts_select_admin" on public.contracts;
