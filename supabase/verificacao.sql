-- ✅ SOMENTE LEITURA — seguro de rodar a qualquer momento, inclusive em
-- produção. Confere se o banco está no estado vigente e aponta o que faltou.
-- Rode depois de cada migration de supabase/migrations/, e sempre que houver
-- dúvida sobre o estado de produção. Os supabase_*.sql da raiz estão
-- congelados e NÃO devem ser executados — ver docs/ARQUITETURA.md (R4).
-- =========================================================================
-- VERIFICAÇÃO — rode DEPOIS de supabase_seguranca.sql.
--
-- Não altera nada. Ou diz que está tudo certo, ou aponta exatamente o que
-- faltou. Segurança sem prova de que funciona é suposição.
-- =========================================================================
do $$
declare
  v_qtd integer;
  v_txt text;
begin
  -- 1. Nenhuma regra de acesso alcançando o visitante anônimo.
  select count(*) into v_qtd
    from pg_policies
   where schemaname = 'public' and tablename = 'tenant_links'
     and roles::text like '%anon%';
  if v_qtd > 0 then
    raise exception 'FALHA 1: ainda existem % regra(s) de acesso para anon em tenant_links', v_qtd;
  end if;

  -- 2. Nenhuma permissão direta de tabela (a porta dos fundos).
  select count(*) into v_qtd
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'tenant_links'
     and grantee in ('anon', 'authenticated');
  if v_qtd > 0 then
    raise exception 'FALHA 2: anon/authenticated ainda tem % permissao(oes) diretas em tenant_links', v_qtd;
  end if;

  -- 3. RLS ligada na tabela.
  if not exists (select 1 from pg_class
                  where oid = 'public.tenant_links'::regclass and relrowsecurity) then
    raise exception 'FALHA 3: RLS desligada em tenant_links';
  end if;

  -- 4. Criar link fora do alcance do anônimo.
  select count(*) into v_qtd
    from information_schema.routine_privileges g
    join information_schema.routines r on r.specific_name = g.specific_name
   where r.specific_schema = 'public'
     and r.routine_name = 'create_tenant_link'
     and g.grantee in ('anon', 'PUBLIC');
  if v_qtd > 0 then
    raise exception 'FALHA 4: create_tenant_link ainda executavel por anon/PUBLIC';
  end if;

  -- 5. Teto de tamanho presente.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.tenant_links'::regclass
                    and conname = 'tenant_links_payload_max') then
    raise exception 'FALHA 5: teto de tamanho (tenant_links_payload_max) ausente';
  end if;

  -- 6. set_tenant_link com uma assinatura só.
  select count(*) into v_qtd
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_tenant_link';
  if v_qtd <> 1 then
    raise exception 'FALHA 6: set_tenant_link tem % assinaturas (esperado 1)', v_qtd;
  end if;

  -- 7. Coluna de dono presente.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tenant_links'
                    and column_name = 'created_by') then
    raise exception 'FALHA 7: coluna created_by ausente';
  end if;

  -- 8. Retenção padrão de 30 dias.
  select column_default into v_txt
    from information_schema.columns
   where table_schema = 'public' and table_name = 'tenant_links'
     and column_name = 'expires_at';
  if v_txt is null or v_txt not like '%30 days%' then
    raise exception 'FALHA 8: padrao de expires_at nao e 30 dias (esta: %)', coalesce(v_txt, 'nulo');
  end if;

  -- 9. RLS ligada em todas as tabelas com dado de cliente.
  select count(*) into v_qtd
    from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'
     and relname in ('contracts','profiles','properties','clients','financial_records')
     and not relrowsecurity;
  if v_qtd > 0 then
    raise exception 'FALHA 9: % tabela(s) de dados de cliente sem RLS', v_qtd;
  end if;

  -- ── As funções precisam EXECUTAR, não só existir ───────────────────────
  -- Os testes 1-9 conferem estrutura. Estrutura certa nao garante que roda:
  -- get_tenant_link chegou a passar em todos eles declarada com p_id uuid
  -- contra uma coluna text, e so quebrava na hora de um inquilino abrir o
  -- link. Daqui em diante, chamada de verdade.

  -- 10. Leitura do link (o caminho do inquilino).
  begin
    perform public.get_tenant_link('00000000-0000-4000-8000-000000000000');
  exception when others then
    raise exception 'FALHA 10: get_tenant_link nao executa -> %', sqlerrm;
  end;

  -- 11. Gravação do link (o envio do inquilino). Id inexistente devolve
  --     false sem tocar em nada — nao suja o banco.
  begin
    perform public.set_tenant_link('00000000-0000-4000-8000-000000000000', 'verificacao', false);
  exception when others then
    raise exception 'FALHA 11: set_tenant_link nao executa -> %', sqlerrm;
  end;

  -- 12. Criação exige sessão. Aqui roda como postgres, sem auth.uid(),
  --     entao TEM que ser recusada com 42501. Se aceitar, o furo continua.
  begin
    perform public.create_tenant_link('verificacao-sem-sessao', 'x');
    v_txt := 'aceitou chamada sem sessao — o furo do insert livre continua aberto';
  exception
    when sqlstate '42501' then v_txt := 'ok';
    when others           then v_txt := 'falhou por outro motivo -> ' || sqlerrm;
  end;
  if v_txt <> 'ok' then
    raise exception 'FALHA 12: create_tenant_link %', v_txt;
  end if;

  raise notice '============================================';
  raise notice 'OK - as 12 garantias de seguranca conferidas.';
  raise notice '============================================';
end $$;
