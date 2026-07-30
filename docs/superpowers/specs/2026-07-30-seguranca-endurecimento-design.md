# Endurecimento de segurança — Meus Imóveis

**Data:** 2026-07-30
**Contexto:** pré-lançamento com clientes pagantes, Supabase Free (500 MB), escritório de advocacia lidando com CPF, RG, selfie e assinatura de terceiros.

---

## 1. O problema, em português

O link que o locador manda para o inquilino carrega uma senha embutida no endereço (a chave de criptografia, escondida no fragmento da URL). A intenção do desenho é: **só abre o contrato quem tem essa senha**.

O banco de dados não cobra essa senha. Ele tem uma segunda porta — direta, criada por herança e nunca usada pelo aplicativo — por onde qualquer pessoa com a chave pública do projeto (que é pública por design, está no JavaScript) consegue operar sem senha nenhuma.

Três consequências verificadas no código:

**a) A lista inteira de links é legível por qualquer um.** A regra de leitura da tabela é "devolva se ainda não expirou" — sem filtro por identificador. O "só acessa quem tem o id" é convenção do JavaScript do cliente, não regra do banco. O conteúdo sai cifrado, mas os identificadores saem em claro, o que habilita (b).

**b) Qualquer link em andamento pode ser sobrescrito sem a senha.** A regra de escrita é `with check (true)` — o banco não valida a linha resultante. De posse do identificador obtido em (a), um estranho substitui o conteúdo de um contrato aguardando assinatura, e ainda consegue reverter a trava de "já finalizado" e esticar a data de validade.

**c) Criação de linhas é livre e sem teto de tamanho.** A permissão de inserir está concedida ao papel anônimo e o campo de conteúdo é `text` sem limite. No plano Free, com 500 MB de banco, encher o disco é o caminho mais barato para derrubar o sistema.

Além dessas, uma quarta, de natureza diferente:

**d) Contrato envenenado.** O inquilino legítimo detém a senha e monta o conteúdo que quiser. Campos de assinatura e selfie são inseridos na página como HTML sem tratamento; um valor construído como `" onerror="..."` executa código **dentro da sessão logada do locador**, com acesso a todos os dados de todos os clientes dele.

---

## 2. Decisões tomadas

| Decisão | Escolha | Quem decidiu |
|---|---|---|
| Retenção após o inquilino assinar | **30 dias**, depois o link morre | usuário |
| Criar link passa a exigir sessão | **Sim** — transparente na prática, o app já só cria logado | usuário |
| Endurecer a CSP (`unsafe-inline`) | **Fora de escopo** — ~85 handlers inline no código, quebraria o app | análise técnica |
| Reescrever o modelo do link (token assinado, Storage) | **Não agora** — semanas de trabalho | usuário |

**Consequência importante da terceira linha:** sem a CSP como rede de segurança, a correção do item (d) precisa ser feita na **origem** dos dados, não tela a tela. Um único ponto esquecido continuaria explorável.

---

## 3. Arquitetura da solução

O princípio: **o visitante anônimo deixa de ter acesso direto à tabela e passa a falar exclusivamente com as três funções do banco**, que já filtram por identificador. Essas funções rodam com privilégio de dono (`SECURITY DEFINER`), então continuam funcionando com a tabela fechada.

```
HOJE                                    DEPOIS

anônimo ──┬─→ RPC (filtra por id) ─→ T  anônimo ──→ RPC (filtra por id) ──→ tabela
          └─→ tabela DIRETA ────────→ T             (porta direta: fechada)
              (sem filtro nenhum)
```

Nada muda para o inquilino nem para os links já enviados: o fluxo do aplicativo sempre usou as funções.

### 3.1 Unidades de mudança

| Unidade | Onde | Depende de |
|---|---|---|
| **Cerca do banco** | `supabase_seguranca.sql` (novo, consolidado) | diagnóstico do estado atual |
| **Fim do retorno silencioso** | `js/database.js:139-149` (remoção) | cerca do banco |
| **Sanitização na fronteira** | `js/database.js` (uma função na descriptografia) | nada |
| **Escape nos textos** | `js/editor.js`, `js/utils.js`, `js/tenant-v2.js` | `Utils.esc` (já existe) |
| **Retenção e expurgo** | `supabase_seguranca.sql` + pg_cron | diagnóstico |
| **Limites de taxa** | painel do Supabase + `create_tenant_link` | cerca do banco |
| **Testes** | `js/seguranca.test.js`, `supabase_verificacao.sql` | todas as anteriores |

---

## 4. Fase 0 — Descobrir o estado real (pré-requisito)

Três arquivos SQL (`supabase_schema.sql`, `supabase_rls.sql`, `supabase_finalize.sql`) recriam as mesmas regras com conteúdo divergente, e `set_tenant_link` foi criada com duas assinaturas incompatíveis (`uuid` e `text`). **O repositório não permite saber o que está no ar.**

`supabase_diagnostico.sql` (já criado, somente leitura) responde: regras ativas, assinaturas vivas das funções, quem tem permissão de executar cada uma, permissões diretas de tabela, colunas e restrições, se a RLS está ligada, se o pg_cron existe, volume atual da tabela e quem tem papel de admin.

**Saída necessária antes de aplicar a Fase 1.** Dois pontos dependem dela: se já existem linhas acima de 512 KB (impediria adicionar a restrição de tamanho) e se o pg_cron está disponível para o expurgo automático.

---

## 5. Fase 1 — A cerca do banco

Arquivo único e idempotente, `supabase_seguranca.sql`, que substitui a divergência dos três anteriores.

**5.1 Fechar a porta direta.** Remover as três regras de acesso de `tenant_links` e revogar as permissões de tabela dos papéis `anon` e `authenticated`. Com a RLS ligada e nenhuma regra, o acesso direto é negado por padrão. Nenhum código do aplicativo consulta essa tabela diretamente — só via funções — então nada quebra.

**5.2 Criar link exige sessão e passa a ter dono.** Adicionar coluna `created_by uuid references auth.users(id) on delete cascade`; `create_tenant_link` recusa chamada sem sessão e grava o dono. Revogar a permissão de execução do papel anônimo. A coluna também habilita, no futuro, o locador revogar os próprios links e o expurgo em cascata quando a conta é excluída.

**5.3 Teto de tamanho.** Restrição `check (length(encrypted_payload) <= 524288)` — 512 KB. Referência: selfie de 600 px em JPEG q=0.75 (~40–80 KB) mais duas assinaturas PNG (~5–20 KB cada) mais os campos de texto, tudo cifrado e em base64, fica na casa de 200 KB. O teto é folga, não aperto. A restrição no banco vale para **qualquer** caminho, inclusive quem chamar a função diretamente sem passar pelo aplicativo.

**5.4 Consolidar `set_tenant_link`.** Derrubar todas as sobrecargas e recriar uma única versão com `p_id text` (a coluna é text; a versão `uuid` foi a causa do erro `operator does not exist: text = uuid` em produção). Acrescentar verificação de tamanho com mensagem legível e, ao finalizar, encurtar a validade para 30 dias.

**5.5 Eliminar a degradação silenciosa.** Hoje, se a função de três argumentos não existir, `js/database.js:139` reenvia sem o parâmetro de finalização e o link **nunca trava** — o único sinal é um `console.warn`. Com a assinatura consolidada e garantida, esse caminho de retorno deixa de ter razão de existir e é removido: falha passa a ser falha visível.

---

## 6. Fase 2 — O contrato envenenado

**6.1 Sanitizar na fronteira (a correção estrutural).** Todo dado controlado pelo inquilino entra por uma única porta: a descriptografia em `js/database.js`. Validar ali, uma vez, protege todos os pontos de exibição — os de hoje e os que forem escritos amanhã.

Regra: qualquer campo cujo valor comece com `data:` precisa casar com o formato estrito de imagem em base64 (`data:image/(png|jpeg|webp);base64,` seguido apenas de caracteres do alfabeto base64). O que não casar vira string vazia. É o que impede `" onerror="` de existir dentro de um atributo `src`.

Isso resolve a classe inteira dos seis pontos de assinatura/selfie sem depender de lembrar de cada um.

**6.2 Escapar os textos que viram HTML.** Cinco interpolações de texto entram em `innerHTML` sem tratamento: valor e extenso da caução e nome e documento do fiador (`js/editor.js:514`, `:518`), o mesmo par na tela do inquilino (`js/tenant-v2.js:551`, `:555`) e o hash de aceite no certificado (`js/utils.js:701`). Aplicar `Utils.esc`, que já existe e já é usado corretamente em dezenas de outros pontos.

**6.3 Fora de escopo, registrado.** `script-src 'unsafe-inline'` permanece por dependência de ~85 handlers inline. Caminho de correção quando houver fôlego: migrar para delegação de eventos, aí remover a diretiva. Enquanto não for feito, 6.1 e 6.2 são a única barreira — por isso a correção é na fronteira.

---

## 7. Fase 3 — Retenção e LGPD

**7.1 Prazos.** Validade padrão de link não assinado: 90 → **30 dias** (contém CPF, RG e dados bancários do locador; não há motivo para 3 meses). Após assinatura: **30 dias**, conforme decidido — janela para importar o contrato, depois selfie, documento, IP e coordenadas somem do servidor. Os dados permanecem no contrato e no PDF do locador.

**7.2 Expurgo automático.** `supabase_rls.sql:143-148` define um job de pg_cron diário que apaga links expirados. O diagnóstico dirá se foi aplicado. Se o pg_cron não estiver disponível no Free, a alternativa é o expurgo oportunista dentro de `get_tenant_link` (apagar expirados na leitura), com o custo de uma escrita no caminho de leitura.

**7.3 Consentimento antes da coleta.** Hoje `js/tenant-v2.js:681-690` dispara a captura de IP (via terceiros: `api.ipify.org`, `ipapi.co`) e de GPS no clique de "Salvar e Enviar", sem etapa própria de aviso. Acrescentar aviso explícito antes da captura, dizendo o que é coletado e para quê (prova de autoria do aceite). Base legal e finalidade ficam demonstráveis — que é o que a LGPD cobra.

**7.4 Precisão do GPS.** Gravado com 6 casas decimais (~11 cm). Para provar autoria de aceite, 4 casas (~11 m) cumprem a mesma função com muito menos exposição. **Decisão pendente do usuário.**

**7.5 Riscos conhecidos e aceitos nesta rodada:**
- `contracts.cloud_key` é armazenada em claro; a regra de leitura do admin concede a coluna. Como o admin é o próprio usuário, o risco é interno. Correção adequada exige repensar onde a chave vive — fica para a reescrita do modelo (opção C).
- O conteúdo enviado ao inquilino inclui CPF, RG e dados bancários do locador. Parte é legítima (o contrato os nomeia); a minimização exigiria separar o que vai no link do que fica no contrato.

---

## 8. Fase 4 — Limites de taxa

Com a Fase 1 aplicada, a superfície anônima encolhe para "atualizar um link cujo identificador já se conhece". A enumeração — que era o que tornava o abuso barato — desaparece. O que resta:

**8.1 Autenticação (painel do Supabase, sem código).** Configurar limites de cadastro, login e recuperação de senha por hora e por IP. É recurso nativo, de graça, e cobre o vetor mais comum: força bruta em contas de clientes.

**8.2 Teto de links por usuário.** Dentro de `create_tenant_link`, recusar acima de **100 links por dia por usuário**. Muito acima do uso real de um escritório; serve como disjuntor contra conta comprometida ou laço infinito no cliente, não como cota comercial.

**8.3 Limite por IP na atualização — condicional.** Só se o diagnóstico revelar volume anômalo. Custa uma tabela de contadores e uma escrita por requisição; sem enumeração possível, provavelmente é complexidade sem retorno. **Não implementar por padrão.**

---

## 9. Fase 5 — Verificação

Segurança sem prova de que funciona é suposição.

**9.1 `supabase_verificacao.sql`** — roda depois da Fase 1 e falha ruidosamente se alguma garantia não estiver de pé: nenhuma regra para `anon` em `tenant_links`, nenhuma permissão direta de tabela, `create_tenant_link` fora do alcance do anônimo, restrição de tamanho presente, RLS ligada em todas as tabelas, uma única assinatura de `set_tenant_link`.

**9.2 `js/seguranca.test.js`** — teste em Node, no padrão dos existentes: o sanitizador aceita data-URL legítima de imagem, rejeita `data:text/html`, rejeita `javascript:`, rejeita a tentativa de quebra de atributo com `" onerror="`, e devolve string vazia (não `undefined`) para entrada inválida.

**9.3 Teste manual de ponta a ponta**, com um contrato descartável: gerar link, abrir em janela anônima, preencher, enviar, importar. Confirma que a cerca não quebrou o fluxo real.

---

## 10. Ordem de execução e critério de pronto

| Ordem | Fase | Bloqueia | Pronto quando |
|---|---|---|---|
| 1 | Fase 0 — diagnóstico | tudo | saída colada e interpretada |
| 2 | Fase 1 — cerca | 4, 5 | `supabase_verificacao.sql` passa inteiro |
| 3 | Fase 2 — envenenamento | — | `js/seguranca.test.js` passa; sinks corrigidos |
| 4 | Fase 3 — retenção | — | prazos ativos; expurgo confirmado; aviso na tela |
| 5 | Fase 4 — limites | — | limites de auth no painel; teto na função |
| 6 | Fase 5 — verificação | — | teste de ponta a ponta com contrato descartável |

Fases 2 e 3 são independentes entre si e podem ser feitas em qualquer ordem depois da 1.

**Fora de escopo, registrado:** remoção de `unsafe-inline`, reescrita do modelo do link, chave do link fora do banco, minimização dos dados do locador no conteúdo enviado, identificadores previsíveis nas tabelas do ERP (mitigado hoje pela RLS por dono).
