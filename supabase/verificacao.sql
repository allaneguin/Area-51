-- SOMENTE LEITURA — seguro de rodar a qualquer momento, inclusive em
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

  -- ── Migration 002 ──────────────────────────────────────────────────────
  -- Estes tres nasceram de uma falha deste proprio arquivo: em 07/08 ele
  -- imprimia "OK - 12 garantias" num banco onde a 002 nunca tinha sido
  -- aplicada. Nenhum dos 12 testes olhava para ela, entao o furo (admin lendo
  -- cloud_key, que e credencial anon-utilizavel) passou meses despercebido.
  -- Verificacao que so confere o que ja se sabe nao serve para nada.

  -- 13. A politica antiga do admin nao pode existir: ela libera contracts
  --     INTEIRA, sem restricao de coluna, incluindo cloud_key.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'contracts'
                and policyname = 'contracts_select_admin') then
    raise exception 'FALHA 13: contracts_select_admin existe -> 002 nao aplicada, admin le cloud_key';
  end if;

  -- 14. E a funcao que a substituiu tem que estar no lugar.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'admin_list_contracts') then
    raise exception 'FALHA 14: admin_list_contracts ausente -> o painel de admin quebra';
  end if;

  -- 15. E nao pode devolver credencial de link.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'admin_list_contracts'
                and pg_get_function_result(p.oid) ilike '%cloud_%') then
    raise exception 'FALHA 15: admin_list_contracts devolve cloud_id/cloud_key';
  end if;

  -- ── Migration 003 ──────────────────────────────────────────────────────

  -- 16. O caminho do inquilino PRECISA continuar aberto a anon. Uma regressao
  --     aqui quebra o envio em silencio, e os testes acima continuariam
  --     passando — sao o mesmo tipo de ponto cego do 13.
  if not has_function_privilege('anon', 'public.get_tenant_link(text)', 'execute')
     or not has_function_privilege('anon', 'public.set_tenant_link(text,text,boolean,text)', 'execute') then
    raise exception 'FALHA 16: get/set_tenant_link nao executavel por anon -> inquilino nao envia';
  end if;

  -- 17. Prova de posse da chave: sem a coluna, o id sozinho sobrescreve o
  --     link de qualquer um que o tenha encaminhado.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tenant_links'
                    and column_name = 'key_proof') then
    raise exception 'FALHA 17: tenant_links.key_proof ausente -> 003 nao aplicada';
  end if;

  -- 18. Carimbo do servidor: sem ele, a trilha do aceite e escrita por quem
  --     assina, e o certificado do PDF vira autodeclaracao.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tenant_links'
                    and column_name = 'finalized_at') then
    raise exception 'FALHA 18: tenant_links.finalized_at ausente -> 003 nao aplicada';
  end if;

  -- 19. O expurgo saiu da leitura (003) e passou a depender do agendamento.
  --     Sem o job, "retencao de 30 dias" vira so uma data numa coluna.
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from cron.job where jobname = 'purge_expired_tenant_links') then
    raise exception 'FALHA 19: expurgo agendado ausente -> link expirado nunca e apagado';
  end if;

  raise notice '============================================';
  raise notice 'OK - as 19 garantias de seguranca conferidas.';
  raise notice '============================================';
end $$;
