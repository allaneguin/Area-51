-- =========================================================================
-- DIAGNÓSTICO — somente leitura, não altera nada.
-- Rode no SQL Editor do Supabase e cole a saída de volta no chat.
-- Serve para descobrir o estado REAL do banco, já que três scripts
-- (schema/rls/finalize) recriam as mesmas policies com conteúdo diferente.
-- =========================================================================

-- 1. Policies ativas em tenant_links: para quem valem e o que exigem.
select
  policyname,
  cmd                          as operacao,
  roles::text                  as papeis,
  coalesce(qual, '(sem using)')       as using_,
  coalesce(with_check, '(sem check)') as with_check_
from pg_policies
where schemaname = 'public' and tablename = 'tenant_links'
order by cmd, policyname;

-- 2. Assinaturas vivas das RPCs do link (queremos saber se há duplicata uuid/text).
select
  p.proname                                   as funcao,
  pg_get_function_identity_arguments(p.oid)   as argumentos,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as seguranca
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_tenant_link', 'set_tenant_link', 'get_tenant_link',
                    'admin_list_users', 'delete_own_account')
order by p.proname, argumentos;

-- 3. Quem pode EXECUTAR cada RPC (é aqui que aparece o grant para anon).
select
  r.routine_name  as funcao,
  r.specific_name as versao,
  g.grantee       as papel
from information_schema.routine_privileges g
join information_schema.routines r on r.specific_name = g.specific_name
where r.specific_schema = 'public'
  and r.routine_name in ('create_tenant_link', 'set_tenant_link', 'get_tenant_link',
                         'admin_list_users', 'delete_own_account')
  and g.grantee in ('anon', 'authenticated', 'public')
order by r.routine_name, g.grantee;

-- 4. Permissões de tabela para anon (acesso direto via PostgREST, fora das RPCs).
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as permissoes
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 5. Colunas e defaults de tenant_links (expires_at padrão, coluna finalized, CHECK de tamanho).
select column_name, data_type, is_nullable, coalesce(column_default, '-') as padrao
from information_schema.columns
where table_schema = 'public' and table_name = 'tenant_links'
order by ordinal_position;

select conname as constraint_name, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.tenant_links'::regclass;

-- 6. RLS está de fato ligada em todas as tabelas?
select relname as tabela, relrowsecurity as rls_ligada, relforcerowsecurity as rls_forcada
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;

-- 7. O job de limpeza do pg_cron existe e está ativo?
select
  (select count(*) from pg_extension where extname = 'pg_cron') as extensao_pg_cron_instalada;

-- Se a linha acima retornar 1, rode também:
--   select jobid, jobname, schedule, active, command from cron.job;

-- 8. Volume atual — dimensiona o risco de encher o Free tier (500 MB).
select
  count(*)                                            as total_links,
  count(*) filter (where expires_at > now())          as vivos,
  count(*) filter (where finalized)                   as finalizados,
  coalesce(max(length(encrypted_payload)), 0)         as maior_payload_bytes,
  coalesce(round(avg(length(encrypted_payload))), 0)  as media_payload_bytes,
  pg_size_pretty(pg_total_relation_size('public.tenant_links')) as tamanho_tabela
from public.tenant_links;

-- 9. Quem está com papel de admin (confere se o grant pegou no e-mail certo).
select email, raw_app_meta_data ->> 'role' as papel, created_at
from auth.users
where raw_app_meta_data ->> 'role' is not null;
