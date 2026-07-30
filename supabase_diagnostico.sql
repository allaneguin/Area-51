-- =========================================================================
-- DIAGNÓSTICO — somente leitura, não altera nada.
--
-- Uma consulta só, devolvendo um único campo JSON. O SQL Editor do Supabase
-- exibe apenas o resultado da ÚLTIMA instrução quando se roda várias de uma
-- vez, então tudo vem junto aqui.
--
-- Rode, clique na célula do resultado e copie o conteúdo inteiro.
-- =========================================================================

select jsonb_pretty(jsonb_build_object(

  -- 1. Regras de acesso ativas em tenant_links.
  --    Interessa: alguma alcança 'anon'? O 'check' é 'true'?
  '1_policies_tenant_links', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'policy',  policyname,
             'op',      cmd,
             'papeis',  roles::text,
             'using',   coalesce(qual, '-'),
             'check',   coalesce(with_check, '-')
           ) order by cmd, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public' and tablename = 'tenant_links'
  ),

  -- 2. Assinaturas vivas das funções. Duas versões de set_tenant_link
  --    (uma com uuid, outra com text) explicariam o erro de produção.
  '2_funcoes', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'funcao',   p.proname,
             'args',     pg_get_function_identity_arguments(p.oid),
             'seguranca', case when p.prosecdef then 'DEFINER' else 'INVOKER' end
           ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_tenant_link','set_tenant_link','get_tenant_link',
                        'admin_list_users','delete_own_account')
  ),

  -- 3. Quem pode EXECUTAR cada função. É aqui que aparece o grant para anon.
  '3_quem_executa', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'funcao', r.routine_name,
             'papel',  g.grantee
           ) order by r.routine_name, g.grantee), '[]'::jsonb)
    from information_schema.routine_privileges g
    join information_schema.routines r on r.specific_name = g.specific_name
    where r.specific_schema = 'public'
      and r.routine_name in ('create_tenant_link','set_tenant_link','get_tenant_link',
                             'admin_list_users','delete_own_account')
      and g.grantee in ('anon','authenticated','PUBLIC')
  ),

  -- 4. Permissões DIRETAS de tabela (acesso via PostgREST, fora das funções).
  --    tenant_links aparecendo aqui para anon é a porta dos fundos.
  '4_permissoes_tabela', (
    select coalesce(jsonb_agg(x order by x->>'tabela', x->>'papel'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'tabela', table_name,
               'papel',  grantee,
               'perms',  string_agg(privilege_type, ',' order by privilege_type)
             ) as x
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon','authenticated')
      group by table_name, grantee
    ) s
  ),

  -- 5. Colunas de tenant_links: padrão de expires_at, existência de finalized/created_at.
  '5_colunas_tenant_links', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'coluna', column_name,
             'tipo',   data_type,
             'padrao', coalesce(column_default, '-')
           ) order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_links'
  ),

  -- 5b. Restrições da tabela (queremos saber se já existe teto de tamanho).
  '5b_constraints_tenant_links', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nome', conname,
             'def',  pg_get_constraintdef(oid)
           ) order by conname), '[]'::jsonb)
    from pg_constraint
    where conrelid = 'public.tenant_links'::regclass
  ),

  -- 6. RLS ligada em todas as tabelas de dados?
  '6_rls_por_tabela', (
    select coalesce(jsonb_object_agg(relname, relrowsecurity), '{}'::jsonb)
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
  ),

  -- 7. pg_cron disponível? Decide o caminho do expurgo automático.
  '7_pg_cron_instalado', (
    select exists (select 1 from pg_extension where extname = 'pg_cron')
  ),

  -- 8. Volume atual. maior_payload decide se o teto de 512 KB pode ser criado
  --    direto ou se há registros gigantes para limpar antes.
  '8_volume', (
    select jsonb_build_object(
             'total',           count(*),
             'vivos',           count(*) filter (where expires_at > now()),
             'finalizados',     count(*) filter (where finalized),
             'maior_payload',   coalesce(max(length(encrypted_payload)), 0),
             'media_payload',   coalesce(round(avg(length(encrypted_payload))), 0),
             'tamanho_tabela',  pg_size_pretty(pg_total_relation_size('public.tenant_links'))
           )
    from public.tenant_links
  ),

  -- 9. Quem tem papel de admin.
  '9_admins', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', email,
             'papel', raw_app_meta_data ->> 'role'
           )), '[]'::jsonb)
    from auth.users
    where raw_app_meta_data ->> 'role' is not null
  )

)) as diagnostico;

-- Se o campo 7_pg_cron_instalado vier `true`, rode também esta linha e cole a saída:
--   select jobname, schedule, active, command from cron.job;
