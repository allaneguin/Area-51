-- =========================================================================
-- DIAGNÓSTICO — somente leitura, não altera nada.
--
-- Devolve LINHAS CURTAS em vez de um JSON grande: a grade de resultados do
-- Supabase trunca célula longa, então tudo aqui cabe na largura da tela.
--
-- Rode e mande um print do resultado (são poucas linhas).
-- =========================================================================

select * from (

  -- ── A. Regras de acesso em tenant_links ────────────────────────────────
  -- Procuro: alguma alcança 'anon'? Algum check é 'true'?
  select 'A. policy' as item,
         policyname || '  [' || cmd || ']  papeis=' || roles::text
           || '  using=' || coalesce(qual, '-')
           || '  check=' || coalesce(with_check, '-') as detalhe
    from pg_policies
   where schemaname = 'public' and tablename = 'tenant_links'

  union all
  select 'A. policy', '(nenhuma policy em tenant_links)'
   where not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'tenant_links')

  -- ── B. Assinaturas das funções ─────────────────────────────────────────
  -- Duas versões de set_tenant_link (uuid e text) explicariam o erro
  -- "operator does not exist" que apareceu em produção.
  union all
  select 'B. funcao',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')  '
           || case when p.prosecdef then 'DEFINER' else 'INVOKER' end
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_tenant_link','set_tenant_link','get_tenant_link')

  -- ── C. Quem pode executar cada função ──────────────────────────────────
  -- 'anon' em create_tenant_link é o insert livre.
  union all
  select 'C. executa',
         r.routine_name || '  <-  ' || g.grantee
    from information_schema.routine_privileges g
    join information_schema.routines r on r.specific_name = g.specific_name
   where r.specific_schema = 'public'
     and r.routine_name in ('create_tenant_link','set_tenant_link','get_tenant_link')
     and g.grantee in ('anon','authenticated','PUBLIC')

  -- ── D. Permissão DIRETA de tabela em tenant_links ──────────────────────
  -- É a porta dos fundos: acesso via PostgREST sem passar pelas funções.
  union all
  select 'D. tabela direta',
         grantee || ' -> ' || string_agg(privilege_type, ',' order by privilege_type)
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'tenant_links'
     and grantee in ('anon','authenticated')
   group by grantee

  union all
  select 'D. tabela direta', '(anon/authenticated SEM acesso direto — ja fechado)'
   where not exists (select 1 from information_schema.role_table_grants
                      where table_schema = 'public' and table_name = 'tenant_links'
                        and grantee in ('anon','authenticated'))

  -- ── E. Padrão de expiração e restrições ────────────────────────────────
  union all
  select 'E. expires_at padrao', coalesce(column_default, '(sem padrao)')
    from information_schema.columns
   where table_schema = 'public' and table_name = 'tenant_links'
     and column_name = 'expires_at'

  union all
  select 'E. constraint', conname || '  ' || pg_get_constraintdef(oid)
    from pg_constraint
   where conrelid = 'public.tenant_links'::regclass

  -- ── F. Colunas presentes (created_by ja existe? created_at?) ───────────
  union all
  select 'F. colunas', string_agg(column_name, ', ' order by ordinal_position)
    from information_schema.columns
   where table_schema = 'public' and table_name = 'tenant_links'

  -- ── G. RLS ligada em todas as tabelas? ─────────────────────────────────
  union all
  select 'G. RLS',
         case when count(*) filter (where not relrowsecurity) = 0
              then 'ligada em todas as ' || count(*) || ' tabelas'
              else 'DESLIGADA em: ' || string_agg(relname, ', ') filter (where not relrowsecurity)
         end
    from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'

  -- ── H. pg_cron: decide o caminho do expurgo automático ─────────────────
  union all
  select 'H. pg_cron',
         case when exists (select 1 from pg_extension where extname = 'pg_cron')
              then 'INSTALADO'
              else 'nao instalado' end

  -- ── I. Volume: maior_payload decide se o teto de 512 KB entra direto ───
  union all
  select 'I. volume',
         'linhas=' || count(*)
           || '  vivos=' || count(*) filter (where expires_at > now())
           || '  finalizados=' || count(*) filter (where finalized)
           || '  maior_payload=' || coalesce(max(length(encrypted_payload)), 0)
           || '  tabela=' || pg_size_pretty(pg_total_relation_size('public.tenant_links'))
    from public.tenant_links

) t
order by item, detalhe;

-- Se H vier INSTALADO, rode também e mande o print:
--   select jobname, schedule, active from cron.job;
