# Changelog — Meus Imóveis

Registro de todas as alterações do sistema, para o time ter uma referência única do que já foi feito e por quê — não importa se a mudança foi feita manualmente ou com apoio de IA, todo pedido de alteração entra aqui.

**Convenção para quem for atualizar este arquivo:**
- Mais recente primeiro.
- Uma seção por dia (`## AAAA-MM-DD`).
- Cada linha cita o hash do commit entre parênteses — quem quiser o detalhe roda `git show <hash>`.
- Uma ou duas linhas por mudança bastam: o quê, e o porquê quando não for óbvio. Não precisa ser extenso.

> Anterior a 20/07: reconstruído a partir do `git log`, sem o contexto das conversas que geraram cada commit — resumos fiéis às mensagens originais.

---

## 2026-08-28

**Os quatro furos do proprio rate limit, fechados.** A analise critica do que eu tinha escrito na vespera achou dois problemas serios e dois de segunda ordem:

- **IPv6 anulava o limite.** A chave era o endereco inteiro — mas um cliente IPv6 nao recebe UM endereco, recebe um bloco **/64**: 18 quintilhoes deles. Trocar de endereco dentro do proprio bloco e uma linha de configuracao, e cada troca ganhava orcamento novo. Agora a chave e o **bloco**, com a forma comprimida (`2001:db8::1`) expandida antes de cortar — senao o mesmo endereco escrito de duas maneiras viraria duas chaves. De quebra resolve o crescimento do Map, que ganhava uma entrada por tentativa.
- **Nao havia limite por CONTA.** O teto por IP protege a porta, nao a conta: mil enderecos fazendo cinco tentativas cada nao encostam no teto, e sao cinco mil por minuto contra a mesma senha. Entrou um contador chaveado pelo e-mail — 20 falhas por hora. **Conta so o que falha, e o acerto zera**: contar acerto junto criaria um jeito barato de trancar a conta de alguem de fora, so queimando as tentativas no e-mail dela.
- **Upload de midia nao tinha teto.** A cota por ambiente (8 fotos, 2 videos) nao impede criar vistorias e ambientes sem parar; um laco de `fetch` de uma sessao legitima enchia o disco, que nao tem cota. Agora sao 120/hora **por conta** (nao por IP: quem sobe arquivo ja esta autenticado, e o disco que enche e o dele), e o limite roda **antes** do parser de corpo — pedido recusado nao aloca 25 MB.
- **A armadilha que esperava o deploy.** Com `TRUST_PROXY` indefinida atras de um proxy reverso, o IP de todo mundo vira o do proxy: o limite de 5 logins/min deixa de ser por pessoa e vira um teto **global** — o sexto login do dia, de qualquer um, e recusado — e o certificado passa a registrar o IP errado. O servidor agora **avisa no console** no primeiro pedido que chega assim, e o README explica os dois lados (ligar sem proxy deixa forjar o IP; nao ligar com proxy quebra o limite).

Nenhum dos dois primeiros seria resolvido trocando por `express-rate-limit`: sao furos de **desenho da chave**, nao de contagem. Quatro testes novos, incluindo o que prova que dois enderecos do mesmo /64 dividem o mesmo orcamento e o que prova que acertar a senha zera o contador da conta. **59 testes de backend.**

**A selfie de validacao agora amplia com um clique.** Ela sai com 100px de altura no certificado — tamanho de documento impresso, nao de conferencia: quem precisa comparar o rosto com o documento na mao nao enxergava nada, e a folha nao pode crescer por causa disso.

A mudanca entrou no **unico sink de imagem do sistema** (`Utils.imgSeguro`), entao vale de uma vez para a selfie, a rubrica manuscrita e a foto de vistoria — sem tres implementacoes. O handler recebe o **elemento** (`this`), nunca a URL: a selfie tem ~30 KB de base64, e enfiar isso dentro de um atributo `onclick` seria enorme e faria dado do inquilino virar codigo.

Dois detalhes que o teste de seguranca cobrou na hora: o cursor `zoom-in` foi para uma **classe CSS** em vez de ser concatenado no atributo `style` (a concatenacao sujava o valor que o chamador pediu), e a caixa de zoom tem `display: none` na impressao — aberta na hora do `window.print()`, ela sairia por cima da folha. Tres asserts novos no `seguranca.test.js`, incluindo o que garante que a URL nao entra no `onclick`.

**Criar link com id repetido devolvia 500.** O `insert` em `tenant_links` era puro, sem tratar conflito de chave: uma retentativa depois de conexao instavel — mesmo id de novo — batia na constraint e virava "Erro interno", que nao diz nada a quem chama. Agora e **409** com a frase certa, e o payload original fica intacto. Vale tambem para o caso hostil: outra conta mandando um id conhecido recebe a mesma recusa, **sem descobrir de quem e o link** e sem sobrescrever nada. Dois testes.

**`arquitetura_sistema.md` reescrito com os nomes reais.** Chegou uma versao gerada do documento com **16 nomes de coluna errados** (`title` por `name`, `amount` por `rent_value`, `vistoria_id` por `inspection_id`, `key_proof_hash` por `key_proof`, `users.created_at` por `criado_em`…) e quatro erros de comportamento — o pior deles um `AND finalized = 0` na leitura do link, que se fosse verdade impediria o locador de importar o contrato assinado. A estrutura dela era melhor que a nossa (atores separados, `autonumber`, o passo de importacao); ficou a estrutura, entraram os fatos conferidos contra `pragma table_info`. O documento agora abre dizendo que a referencia e `server/db.js`, e que quando divergirem quem esta errado e o diagrama.

**Diagramas de estado** (`arquitetura_sistema.md` §5): ciclo de vida do contrato — o derivado das datas (`Pendente → A Iniciar → Ativo → Vencido`) separado do gravado (`is_finalized`, caminho so de ida) — e o da vistoria (`Rascunho ↔ Fechada`). A separacao e o ponto: estado derivado nunca envelhece; estado gravado envelhece se ninguem atualizar.

**`ARQUITETURA.md` R2** ganhou as quatro regras que o trabalho desta semana criou de fato: recurso cujo dado o cliente nao pode escolher fica fora do `RECURSOS` (por que `profiles` e `midias` tem rota propria), protecao de porta e middleware e nao `if` em handler (`sessao.js` + `limite.js`), e arquivo servido ao usuario passa por rota autenticada, nunca por pasta estatica. O mapa de modulos do servidor tambem passou a existir.

**Documentacao: escrito o que faltava, corrigido o que mentia.** Um levantamento das quatro fases pedidas mostrou que arquitetura, fluxos, debito tecnico e auditoria de seguranca **ja estavam documentados** (`docs/ARQUITETURA.md`, `arquitetura_sistema.md`) — reescrever criaria duas verdades concorrentes. Foi escrito so o que nao existia:

- **`docs/REFERENCIA.md`** (novo): Parte I com os requisitos funcionais e as **regras de negocio** de verdade — status derivado por datas e nunca digitado, primeira conta vira admin, lista branca da ingestao, saida da vistoria herdando a entrada, vencimento que nunca cai antes do inicio do contrato. Parte II com o **contrato dos 24 endpoints**: metodo, corpo, sucesso e erro, incluindo por que `gravou: false` do link nao e erro HTTP.
- **`arquitetura_sistema.md` corrigido**: o diagrama descrevia colunas que nao existem — `users.created_at` (e `criado_em`), `financial_records.amount` (e `rent_value`), status em ingles (`draft`/`paid`) onde o banco guarda `Rascunho`/`Pago`, e `tenant_links.user_id` (e `created_by`). Documentacao que mente e pior que documentacao nenhuma. Entrou tambem a tabela `midias`, de hoje.
- **README**: as **cinco variaveis de ambiente** (`PORT`, `DB_FILE`, `UPLOADS_DIR`, `HTTPS`, `TRUST_PROXY`) estavam no codigo e em documento nenhum — inclusive as duas de seguranca, cujo efeito de ligar (ou nao ligar) so se descobria lendo `sessao.js` e `index.js`.
- **Check de sintaxe na suite** (`sintaxe.test.js`): sem build, um parentese a menos em `editor.js` so aparecia quando alguem abria aquela tela. Dez arquivos do front — os maiores — nao eram carregados por teste nenhum. `node --check` em **44 arquivos**, sem dependencia nova. Verificado por mutacao: quebrando o `editor.js` de proposito, o teste falha.

**Login e leitura de link ganharam teto por IP.** Nao havia limite de tentativas em duas portas publicas: `POST /api/auth/entrar` (forca bruta de senha) e `GET /api/links/:id` (varredura de UUID atras de contrato). Agora sao 5 logins/min, 10 cadastros/hora, 30 leituras de link/min e 20 escritas/min, por IP, com `429` e `Retry-After`.

Tres detalhes que decidem se isso protege ou so parece proteger:

- **A chave do limite e `escopo + IP`, nunca a URL.** Com o `:id` na chave, cada UUID tentado teria orcamento proprio e a varredura — o ataque que a regra existe para barrar — passaria inteira sem encostar no teto. Ha teste que pede 32 UUIDs *diferentes* e exige que o teto apareca.
- **O teto vale para a senha certa tambem.** Se o acerto passasse livre, bastaria intercalar um login conhecido para zerar o contador.
- **Sem dependencia nova.** `express-rate-limit` resolveria, mas traz cinco transitivas para substituir trinta linhas, e o que ele da a mais (store compartilhado, janela deslizante) supoe varios processos — este e um, com um arquivo de banco. Quando houver mais de um, o `Map` deixa de bastar e o pacote entra pelo motivo certo. Registrado em `server/limite.js`.

O scrypt da senha ja custava ~70ms por tentativa, mas freio de CPU nao e limite: com paralelismo, um dicionario de 10 mil senhas sai em minutos. Com 5/min por IP, vira 33 horas contra uma unica conta.

---

## 2026-08-27

**Vistoria ganhou foto e video por ambiente** (ramo `feat/midia-vistoria`, 7 commits). A vistoria existe para sustentar uma conversa que acontece meses depois — reter ou devolver a caucao — e ate aqui ela guardava so texto. Texto contra texto e a palavra de um contra a do outro.

Desenho em `docs/superpowers/specs/2026-08-27-midia-vistoria-design.md`, plano em `docs/superpowers/plans/2026-08-27-midia-vistoria.md`. Tres decisoes foram do dono do projeto; em duas a recomendacao era outra, e o preco de cada uma virou trabalho no lugar de ressalva:

| Decisao | O que ela custou, e onde isso foi pago |
|---|---|
| Foto **e** video curto | Teto de 8 MB (foto) e 25 MB (video), 8 fotos e 2 videos por ambiente, corte automatico de gravacao em 30s. A CSP ganhou `media-src 'self' blob:` — sem a diretiva, `default-src` bloqueia o preview `blob:` e a tela fica preta. |
| Arquivos em `uploads/`, nao blob no banco | Backup passou a ser **duas coisas** (`data.db` + `uploads/`), registrado no README; e a cascata do SQLite apaga a linha sem apagar o arquivo, entao entrou uma varredura de orfao na leitura — o mesmo desenho do `expurgar()` dos links, que ja tinha dispensado agendador. |
| Camera dentro da pagina | `getUserMedia` + `MediaRecorder`, **com o seletor de arquivo ao lado**: camera na pagina nao existe em contexto nao-seguro, a permissao pode ser negada e a maquina pode nao ter camera. Sem o fallback, a funcionalidade simplesmente nao existiria nesses casos. |

**Onde a midia mora:** tabela `midias` propria, **fora do mapa `RECURSOS`**. No CRUD generico o corpo do pedido decide o conteudo das colunas declaradas, e uma delas e `arquivo` — o nome de um arquivo real no disco. Cliente que escolhe nome de arquivo le o arquivo de qualquer um. Pela mesma razao a leitura passa por `GET /api/midias/:id/arquivo` com sessao e `sendFile` (que ainda trata `Range` de graca, e e com Range que o `<video>` busca no meio sem baixar 25 MB), **nunca por pasta estatica**: nome adivinhavel vazaria foto de imovel de cliente por URL.

**Upload sem dependencia nova:** corpo cru (`express.raw`), nao multipart. O navegador manda o Blob e o `Content-Type` dele diz o que e. O `package.json` continua com uma dependencia so.

**A armadilha do indice posicional.** `ambiente` e a posicao dentro de `inspections.rooms`: tirar a Sala faz a Cozinha virar 0, e sem tratar isso a foto da sala apagada reaparece na cozinha — a vistoria passaria a documentar o comodo errado. `POST /api/midias/reindexar` apaga a midia do ambiente removido e desloca as seguintes, num DELETE e um UPDATE na mesma requisicao. No cliente seria uma sequencia de pedidos que uma recarga no meio deixa pela metade.

**A tela mudou junto:** o estado do ambiente virou tres botoes no lugar do `select` (um toque em vez de dois, e a cor comunica antes da leitura), o cartao ganhou a faixa de miniaturas com "+ Foto" e "+ Video", as observacoes cairam de 3 para 2 linhas, e o aside passou a responder a pergunta de quem esta vistoriando: "3 de 5 ambientes com midia". Saiu o cartao que dizia que anexar foto exigia bucket da Supabase.

**Verificacao: 50 testes de backend** (eram 37) **e 12 do front** (`npm test`). Os do backend cobrem escopo por conta nas quatro rotas de midia, lista branca de formato, os dois tetos, a quantidade por ambiente, a cascata ao apagar a vistoria, a varredura de orfao e a reindexacao. O do front confere que os limites do cliente sao **os mesmos** do servidor — divergir faria o locador esperar o upload inteiro para ouvir nao.

A parte de camera nao tem seam de teste honesto em Node e segue a regra do ARQUITETURA para tela sem cobertura: **auditoria de runtime**, pendente de execucao no navegador.

---

**Nenhuma edicao de contrato chegava ao banco** — e era isso que criava a "copia" do contrato assinado.

O `PUT /api/:recurso/:id` monta um upsert (`insert ... on conflict(id) do update`). O SQLite avalia o INSERT primeiro, e `created_at` e NOT NULL: como o front so manda os campos alterados numa edicao, a coluna faltava e a rota devolvia **500** em toda gravacao de registro ja existente. O `Storage._cloudWrite` mostrava o toast de erro, o cache em memoria seguia certo, e na recarga a alteracao tinha sumido.

O efeito visivel foi no fluxo do inquilino: ao gerar o link, o `cloud_id`/`cloud_key` nunca gravava. Sem `cloud_id` no contrato, a sincronizacao automatica do editor nunca rodava e a importacao (`#import`) nao achava o contrato de origem — entao criava um **contrato novo, so com os campos do inquilino** e o do locador em branco. Dai o par: o original "aguardando" e a copia "Pendente" (sem datas, `getContractStatus` nao tem como dizer outra coisa) com o selo de assinado.

Correcao numa linha so, no ponto por onde passam os 5 recursos: `created_at` reusa o valor da linha existente (o `set` do upsert continua sem incluir a coluna, entao a data de criacao segue imutavel). Coberto por teste que falha sem a correcao — **36 testes do backend passam**.

Contratos ja partidos em dois nao se juntam sozinhos, e o caso real tinha perdido o original (apagado pela tela). `reparo-contrato-copia.js` reconstroi o contrato a partir do **payload cifrado do proprio link** — a `cloud_key` fica na linha do contrato, entao da para decifrar o que o inquilino leu e assinou: locador, imovel, prazo, valor e as duas assinaturas voltaram inteiros. O carimbo do aceite continua vindo do servidor (`tenant_links.finalized_at`), nunca do payload.

**Contrato de teste em um clique.** Na tela de Modelos, cada modelo ganhou "Contrato de teste (preenchido)": cria o contrato com os 40 campos preenchidos e abre o editor, pronto para gerar o link do inquilino — em vez de digitar tudo de novo a cada teste do fluxo. Os valores saem da DEFINICAO do modelo (tipo, mascara, nome do campo), nao de uma fixture: lista fixa com os 86 campos dos tres modelos ficaria velha no primeiro campo novo, e o teste passaria mentindo. O botao so aparece rodando local (`Utils.ehLocal`, a mesma checagem que o `shareBaseUrl` ja fazia) — ferramenta de teste no painel de um locador de verdade e dado falso esperando ser confundido com contrato.

**E o teste desse gerador achou um bug de dois meses:** a **minuta simples nunca conseguiu gerar link do inquilino**. A porta do `generateTenantLink` era uma lista fixa de cinco campos, e aquele modelo nao tem `dia_vencimento` — pedia um campo que nao existe no formulario, entao nao havia como satisfazer. A regra virou `Utils.faltamParaOLink(fields, template)`, que so cobra o que o modelo tem, e agora o editor e o teste chamam a MESMA funcao. Junto: a data por extenso da assinatura, que estava duplicada com um array de meses proprio no editor, passou a sair de `Utils.dataPorExtenso`.

**O IP do aceite era forjavel por quem assina.** `ipDe()` lia `X-Forwarded-For` direto do pedido — e esse e um cabecalho como outro qualquer: o proprio inquilino escolhia o IP que sairia no certificado. O unico campo da trilha que existe justamente por nao ser redigido por quem assina era o mais facil de falsificar. Agora vale `req.ip`, com `trust proxy` **desligado por padrao** (`app.set('trust proxy', process.env.TRUST_PROXY || false)`): sem proxy na frente, vale o endereco do socket, que ninguem forja; atras de um proxy de verdade o operador liga por variavel de ambiente. Teste no `servidor.test.js` manda `X-Forwarded-For: 8.8.8.8` e prova que ele nao vira evidencia — sem a correcao, virava.

**O certificado dizia "::1" como se fosse endereco de internet.** Loopback e rede privada nao identificam origem externa: dizem que a pessoa assinou na mesma maquina (ou rede) do servidor. `Utils.ipDeEvidencia` passa a imprimir o IP com essa ressalva, e limpa o `::ffff:` do mapeamento IPv4-em-IPv6 do Node, que ia sair cru na folha. Folha que se chama certificado nao pode insinuar mais do que sabe. Seis casos no `ingestao.test.js`.

**Vistorias: a de saida passou a existir.** O `tipo` era gravado como `'Entrada'` na criacao e nao havia caminho nenhum para muda-lo — ou seja, metade do proposito da tela (comparar entrada x saida para decidir a caucao) era inalcancavel pela interface. A criacao virou formulario: imovel (lista, nao mais um `prompt()` do navegador pedindo um numero), momento e data. E a **saida nasce com os ambientes da ultima entrada FECHADA do mesmo imovel** — comparar exige os dois lados com a mesma lista, e redigitar e onde o ambiente que interessava some; estado e observacao nao vem junto, porque sao o que a saida vai constatar. Momento e data ficam corrigiveis enquanto a vistoria e rascunho; vistoria fechada nao muda, que e de onde vem o valor de prova dela. Coberto por `vistorias.test.js` (6 casos, na suite do `npm test`).

Saiu junto a tela `renderIndisponivel`, que mandava o locador abrir o SQL Editor da Supabase e rodar a migration 004 — instrucao morta desde 26/08 (a tabela nasce com o banco, e nada mais escreve `inspectionsDisponivel = false`), e enganosa: apontava para um servico que o sistema nao usa mais. O aviso das fotos, que citava bucket da Supabase, tambem foi reescrito.

**Alinhamento.** Tres coisas, todas com causa unica no CSS, nenhuma resolvida empurrando pixel:

- `.seg-tabs` (o "Foco do dia / Portfolio" e o seletor de mes do financeiro) carregava `margin-bottom: 18px`. Ele vive dentro do `.page-header`, que alinha as acoes pela BASE — a margem empurrava o controle 18px acima dessa linha, e so nessas duas telas o botao do canto ficava mais alto que nas outras.
- O painel escuro sem corpo (o estado "Nada pedindo atencao") ficava 20px mais alto do que precisa: a margem do `.hero-panel-head` virava espaco morto quando o cabecalho e o ultimo filho, e o texto subia dentro do bloco.
- **O espaco entre os blocos de uma tela agora mora num lugar so** (`#main-content > * + *`). Antes cada view carregava o seu: `margin-bottom:20px` inline numa, 24px noutra, `.stats-grid` com 20px na folha, e as que nao carregavam nada colavam um bloco no outro — telas diferentes respiravam diferente. As margens ad-hoc sairam; margens de irmaos colapsam, entao o 26px do `.page-header` continua valendo onde existe.

**Cobranca do mes deixou de nascer vencida.** A geracao de cobrancas cravava vencimento no dia 10, ignorando o `dia_vencimento` do contrato e a data de inicio: um contrato que comeca dia 27 ganhava, no mesmo mes, uma cobranca vencida em 10 — atrasada no instante em que era criada. Agora o dia sai do contrato e nunca cai antes do inicio da locacao (`Utils.vencimentoDoMes`, ao lado dos outros calculos de data); dia 31 em mes curto cai no ultimo dia. Cinco casos no `financeiro.test.js`.

A **aba Financeiro** fica: ela tinha sido removida em 5b38be8 e voltou na migracao para `public/` (o `app.html` veio do `redesign-organic.dc.html`, que ainda tinha o link). Decisao do dono do projeto, nesta sessao — manter a aba e consertar o vencimento.

---

## 2026-08-26

**A Supabase saiu. O sistema passou a ter backend próprio** (assets: 1.32.0 → **2.0.0**; versão do projeto: 2.0.0).

Decisão do dono do projeto, em quatro respostas: os dados eram de protótipo e foram descartados (sem migração, sem preservar link antigo); o backend passa a ser **Node + Express + `node:sqlite`**; o **front fica como está** — só a camada de dados troca de destino; e a redefinição de senha por e-mail **sai**, porque quem enviava o e-mail era a Supabase e não há serviço de envio. Desenho registrado em `docs/superpowers/specs/2026-08-26-backend-proprio-design.md`.

### O que saiu do repositório

Os seis `supabase_*.sql` da raiz, a pasta `supabase/` inteira (README, `verificacao.sql` e as 4 migrations), `js/supabase-config.js` (que levava a URL e a chave do projeto), o `<script>` do CDN jsDelivr, `vercel.json`, `.vercelignore`, `.vercel/` e o `app.html` que era só ponte de redirecionamento. O `redesign-organic.dc.html` virou **`public/app.html`** — o nome era resíduo de maquete e não havia mais link em circulação a preservar.

### A estrutura

O front inteiro mudou-se para `public/`, sem uma linha editada por causa da mudança de pasta. O backend nasceu em `server/`: `index.js` (Express + estático + cabeçalhos de segurança), `db.js` (schema no boot + o mapa `RECURSOS`), `sessao.js` (scrypt + cookie) e `rotas/` (auth, perfil, recursos, links, admin).

### O front: 10 telas intocadas

`dashboard.js`, `contracts.js`, `editor.js`, `tenant-v2.js`, `properties.js`, `clients.js`, `templates.js`, `financeiro.js`, `renovacoes.js`, `vistorias.js`, `utils.js` e todo o CSS: **zero linhas alteradas**. As 55 chamadas a `supabaseClient` estavam concentradas em 6 arquivos, e só o miolo deles mudou — as assinaturas públicas (`Storage.saveContract`, `Auth.logout`, …) ficaram idênticas.

Entrou `js/api.js`. **Não é um `supabaseClient` falso**: um shim com `.from().select().eq()` daria o menor diff possível e seria a pior escolha — quem lesse o código em três meses iria procurar uma Supabase que não existe mais.

### A armadilha que quase passou

`contracts.fields`, `profiles.profile_data` e `inspections.rooms` são `jsonb` no Postgres, e o PostgREST devolvia **objeto já parseado**. O SQLite devolve **string**. Se isso passasse, `contract.fields.valor_aluguel` viraria `undefined` em todas as telas e **nada acusaria** — a tela só mostraria vazio. É a mesma classe do bug de dinheiro 100× de 24/08: o tipo muda na borda. Por isso o `JSON.parse` acontece **na resposta do servidor**, não em `storage.js` — que é o que faz "front intocado" ser verdade em vez de promessa. Coberto por teste.

### A segurança que trocou de dono

**A RLS do Postgres era uma parede do banco: valia mesmo se o servidor errasse. Agora quem garante é código nosso**, e por isso virou teste no mesmo commit. O escopo é de **um middleware só** (`router.use(exigirLogin)` na primeira linha do router de recursos, todo SQL com `user_id` da sessão) — verificação repetida em cada handler é a que alguém esquece de repetir, e a esquecida é a que vaza.

O que foi reimplementado em vez de descartado: teto de 512 KB no payload do link, 100 links/dia por conta, `key_proof` (e o banco guarda **SHA-256 da prova**, não a prova — quem lê a base não escreve no link), `finalized` só de ida, carimbo de evidência feito pelo servidor e fora do payload cifrado, `cloud_key` nunca saindo pelas rotas de admin, e o admin sem acesso ao ERP. O expurgo diário do `pg_cron` virou **apagar na leitura**: tabela lida a cada acesso não precisa de agendador.

Dois ganhos: a CSP perdeu o CDN externo e o host de terceiro, e a sessão passou a viver em **cookie `httpOnly`** — com `unsafe-inline` na CSP, é a única coisa entre um XSS e a conta.

### Correção encontrada pela auditoria

`SuperAdmin.isAdmin()` ainda lia `App.user.app_metadata.role`, o formato do claim no JWT da Supabase — a tela de administração redirecionava para o painel em silêncio. Passou a ler `is_admin === true`, vindo do servidor. O teste foi reescrito para cobrir o formato novo **e** para provar que o formato antigo não autoriza mais por acidente.

### Verificação

**44 testes passam** (`npm test`): 35 do backend (`node:test`, sobem o app num banco descartável e falam por HTTP) e 9 do front. Os do backend cobrem escopo por usuário nas 5 tabelas e no perfil, senha e sessão, o ciclo do link e a forma da resposta.

Auditoria de runtime num Chrome de verdade: **19 módulos carregados, 10 rotas renderizadas, 37 handlers inline disparados um a um — nenhuma falha, zero erro de console.** O fluxo do inquilino foi percorrido ponta a ponta: o locador criou o link, o inquilino abriu numa aba sem sessão (8 campos, sem ver a conta bancária do locador), enviou, e **a tentativa de reescrever o link depois de assinado foi recusada**, assim como a leitura com chave errada. Na importação, um inquilino que enviou `conta_locador: "CONTA-DO-ATACANTE"`, `nome_locador: "ATACANTE"` e `valor_aluguel: "1,00"` não alterou nenhum dos três — a lista branca da ingestão sobreviveu à troca de backend.

### O que ficou de fora, e por quê

**Redefinição de senha por e-mail** — única perda de funcionalidade. A tela saiu; botão que não chega a e-mail nenhum é pior que botão nenhum. **Deploy** — a Vercel serve estático e funções sem estado; um processo com banco em arquivo não roda lá. O sistema roda local (`npm start`); escolher host com disco persistente é decisão pendente, registrada na Parte III do ARQUITETURA.

`docs/ARQUITETURA.md` foi para a **versão 2.0**: a Parte I inteira descrevia a Supabase e foi reescrita, não emendada; as regras R1–R8 da Parte II foram atualizadas (o escopo por sessão substituindo a RLS, o mapa `RECURSOS` como única lista branca, teste de rota obrigatório).

---

## 2026-08-24

Redesenho da interface do app aplicado sobre o sistema real — a maquete virou a tela de verdade (assets: 1.31.0 → **1.32.0**).

**O ponto de partida foi um acidente.** O `app.html` da árvore de trabalho não era o shell da SPA: era um **export de canvas do Claude Design** — 974 KB num arquivo só, runtime do React 18 (UMD, unpkg), 26 blobs em base64 e artboards estáticas com marcadores `{{ primeiroNome }}`. Ele tinha sobrescrito a aplicação inteira: nenhum `js/` ou `css/` era carregado, e a CSP, o anti-FOUC de tema e o boot do `#tenant` tinham sumido junto. O arquivo foi restaurado (`git checkout`) e a maquete, preservada em `docs/mockups/redesign-organic.dc.html` (fora do deploy pelo `.vercelignore`). **Publicar aquele arquivo teria trocado o site inteiro por uma tela azul de "Unpacking..." — sem login e sem contratos.**

**O que entrou de fato.** O redesenho foi aplicado como CSS + shell, não como reescrita das views: as ~5.900 linhas de lógica das 10 telas não foram tocadas. Isso foi escolha, não preguiça — os três maiores arquivos (editor, tenant, auth, ~2.100 linhas) seguem sem cobertura de teste, e reescrever a camada de views inteira em cima deles trocaria um ganho visual por um risco funcional.

- **Paleta "grafite" nos tokens** (`css/index.css`). Entram três rampas de nove degraus (`--color-neutral-*`, `--color-accent-*`, `--color-accent-2-*`) e os nomes antigos (`--primary`, `--card-bg`, `--text-main`…) passam a **apontar** para elas. É o que fez as outras ~3.700 linhas de CSS herdarem o visual novo sem serem reescritas. `--primary` é o degrau **700**, não o 600: o par destaque-sobre-fundo é cor de cromo (3:1) e texto pequeno em cima dele precisa do degrau mais fundo.
- **Tema escuro feito à mão.** O redesenho veio sem — as artboards são todas claras. As rampas escuras foram montadas invertendo a escala de luminância e mantendo os matizes, para o app não **perder** o tema que já tinha. A barra lateral ganhou `border-right`: no claro a diferença de luminosidade já separa as duas colunas, no escuro os dois fundos ficam a poucos passos e a borda vira a única coisa que marca a divisa.
- **Instrument Sans auto-hospedada** (`fonts/instrument-sans.woff2`, 30 KB, extraída do próprio bundle). Variável de 400 a 700 (confirmado pela tabela `fvar`), o que importa porque **as nove ocorrências de `font-weight: 800` do app viraram 700**: fora da faixa declarada, o navegador sintetiza negrito e o título sai borrado. Auto-hospedar mantém a regra de LGPD que tirou o Google Fonts daqui e não mexe na CSP (`font-src 'self'`, R5.5).
- **Barra lateral no lugar da topbar** (`app.html`, `css/components.css`). Coluna escura de 254px, destinos agrupados em Operação / Cadastros / Conta. **O roteador não mudou uma linha:** cada destino continua sendo um `.nav-item` com `href="#rota"`, que é exatamente o que `App.updateNav` procura. A `.mobile-header` e a `.bottom-nav` ficaram como estavam — o celular já estava resolvido.
- **Busca por lista** (`js/app.js` + `data-busca` em 4 views). Filtra o que **já está na tela** comparando o texto visível: sem rede, sem re-render, nenhuma view avisada. Normaliza acento e caixa **nos dois lados** — quem digita "imovel" acha "Imóvel" e vice-versa. A barra só aparece nas quatro rotas que têm lista; nas outras seria um campo que não faz nada, que é justamente o que faz um app parecer maquete. Coberta por `js/busca.test.js`.
- **Botão "Novo contrato" da barra superior saiu.** Ele aparecia junto com a ação própria de cada tela ("Novo Imóvel", "Novo Cliente") — dois botões primários na mesma linha, e fora de Contratos apontando para a coisa errada. A barra ficou só com a busca.
- **Componentes chapados e em pílula** (`css/components.css`): o `.btn-primary` perdeu o gradiente + brilho interno + glow, que carregavam dois hex cravados que não escureciam no tema escuro (R6.1). `.badge` deixou de ser caixa-alta, cartão foi para 32px de raio e campo de uma linha virou pílula — `textarea` **não**, que raio de pílula em caixa alta vira cápsula deformada.

**O que NÃO entrou, e por quê.** A maquete tem três telas que o sistema não tem: **Financeiro** (a aba saiu de propósito em 10/08 — ressuscitar exige decisão de produto, não de CSS), **Renovações** e **Vistorias** (sem tabela, sem RLS, sem `Storage` — seriam migration nova pela R4). Também ficaram de fora o cartão "Avisos automáticos" da lateral e o botão "Alertas" com contador: os números da maquete são inventados e não há envio automático nenhum por trás. Entrar com eles daria telas bonitas que não fazem nada — o oposto do pedido.

**Consertos que a varredura encontrou depois.** Com o redesenho de pé, o app inteiro foi exercitado num arranjo que carrega os módulos reais e troca só a camada do Supabase: as 8 rotas renderizadas e **os 72 handlers `onclick`/`onchange`/`oninput` disparados um a um**. Nenhum estourou — mas a varredura de tokens e de cor cravada achou quatro defeitos, todos anteriores a esta rodada:

- **Dinheiro saía cem vezes menor** (`js/utils.js`). `Utils.formatCurrency` mandava toda **string** para `Utils.maskCurrency`, que é a máscara de DIGITAÇÃO e lê os dígitos como CENTAVOS. Como o PostgREST serializa coluna `numeric` **como string**, um `rent_value` de `2450` virava **R$ 24,50** — no cartão do imóvel, no `<option>` de importar imóvel do editor e, pior, no `valor_aluguel` **e no valor por extenso copiados para dentro do contrato**. Escapava quando a string vinha com duas casas (`"2450.00"` acertava por acaso, o que explica ninguém ter notado); errava em `"2450"`, `"5200"` e `"2450.5"`. Agora existe `Utils.toReais`, que aceita as três formas (número do JS, decimal do Postgres, string já em pt-BR) e decide pela vírgula: com vírgula, o ponto é milhar; sem, o ponto é decimal. Coberto por `js/prazo.test.js`, com o caso da máscara de digitação junto para ela não ser "consertada" depois.
- **Dois tokens fantasma.** `var(--bg)` (`js/editor.js`) e `var(--text-heading)` (`js/tenant-v2.js`) nunca existiram. `var()` inválida **anula a declaração inteira**: campo somente-leitura do editor ficava com a mesma cara de campo editável, e o rótulo da assinatura na tela do inquilino caía num cinza cravado que sumia no tema escuro. É o mesmo defeito que derrubou o `.cliente-resumo` em 10/08 — agora há uma checagem que varre todo `var(--x)` do projeto contra o que o `index.css` define.
- **Cor cravada onde o tema escuro precisa mudar**: moldura da prancheta de assinatura, cartão da selfie e o campo que mostra **o link do inquilino para copiar** eram caixas claras fixas dentro de telas que escurecem. Passaram a token. O que continua fixo de propósito: o fundo branco da prancheta (é "papel", e o PNG da assinatura vai desse jeito para o PDF), o certificado do PDF e a tela de login.
- **"Excluir conta"** (`js/admin.js`) usava `#b3261e` cravado no título e no botão; virou `var(--danger)` e `.btn-danger`.

**Segunda rodada — as telas viraram o desenho, não só a paleta.** A primeira passagem trocou tokens, fonte e shell, mas as views continuavam com o markup antigo por baixo. Nesta, cinco telas foram reescritas para a estrutura das artboards, sempre com dado real:

- **Painel** (`js/dashboard.js`, reescrito): duas leituras da mesma carteira num controle segmentado. **"Foco do dia"** traz a faixa escura *Precisa de você* — uma fila derivada do estado de cada contrato (vencido, vence em até 30 dias, link enviado e não devolvido, contrato sem valor), ordenada por urgência; mais quatro métricas, a lista de ativos e o gráfico de recebido por mês, que sai dos lançamentos em `financial_records` (a tabela nunca saiu, só a tela). **"Portfólio"** traz receita contratada, ocupação da carteira, próximos vencimentos e atividade recente. A altura das barras vem de `--h` calculado no JS a partir do maior valor da série — o CSS não inventa número.
- **Contratos** (`js/contracts.js`, reescrito): as abas residencial/comercial saíram. Elas escondiam metade da carteira o tempo todo e não respondiam a pergunta que se faz de verdade. No lugar, **filtros por estado** com contagem — Todos, Ativos, A vencer, Vencidos, Aguardando inquilino, Comerciais — sobre uma lista única com inicial, etiqueta de status, selo de assinado e metadados curtos.
- **Imóveis** (`js/properties.js`): cartão com faixa de capa, specs, vínculo e rodapé de aluguel. A maquete põe **foto** do imóvel ali; não existe coluna nem bucket para isso, então a faixa mostra a inicial sobre a cor do tema. Identifica o cartão de relance sem fingir um dado que o sistema não tem.
- **Clientes** (`js/clients.js`): tabela dentro de cartão, com avatar e uma coluna nova de **contratos por cliente**, casada por CPF/CNPJ — que é como o resto do sistema liga cliente a contrato (não há FK).
- **Modelos** (`js/templates.js`, reescrito): cartões com ícone, categoria e **quantos contratos já saíram de cada modelo**. O cartão tracejado da maquete diz "criar modelo próprio"; editor de modelos não existe, então ele aponta para a minuta simples, que abre quase em branco — é o que dá para fazer hoje.
- **Perfil** (`js/admin.js`): sobrelinha, título curto e a faixa de excluir conta em token de perigo, no lugar de um `rgba()` cravado que não escurecia.

**Tela nova: Renovações e alertas** (`js/renovacoes.js`, rota `#renovacoes`). Uma linha por **pendência**, não por contrato — o mesmo contrato pode estar vencendo e com reajuste devido ao mesmo tempo, e são duas decisões. **Não trouxe tabela nova:** vencimento sai de `data_termino` e reajuste da trilha que `Storage.applyContractReajuste` já grava. O botão *Aplicar reajuste* é real: pede a taxa, mostra o valor resultante para confirmação e grava valor, extenso e trilha. O que a maquete tinha e **não entrou**: o botão "avisar inquilino" e os interruptores de "quando avisar". Não existe serviço de envio no sistema, e um botão que não avisa ninguém é pior que a ausência dele — o cartão do rodapé diz isso em vez de esconder.

**Ainda de fora:** **Financeiro** (a tela saiu de propósito em 10/08 — voltar é decisão de produto; a tabela e o CRUD seguem de pé e já alimentam o gráfico do painel) e **Vistorias** (sem tabela, sem RLS, sem storage de foto — é migration nova pela R4). O **editor** manteve a estrutura atual: ele já herdou a linguagem nova e é o maior arquivo sem cobertura de teste; reestruturar os três painéis ali trocaria ganho visual por risco no fluxo que gera o contrato.

**Dois defeitos achados nesta rodada:** classe `badge-red`/`badge-purple` usada pelo JS **sem regra no CSS** (a etiqueta saía sem fundo — não quebra, só fica errada, e por isso ninguém nota); e filtro de texto que sobrevivia no campo depois de a view se redesenhar, dando impressão de busca ativa sobre lista que ignorava o termo (`App.reaplicarBusca`). O primeiro virou checagem permanente em `js/tokens.test.js`.

**Terceira rodada — o arquivo da maquete virou o app, e as três telas que faltavam entraram.**

- **`redesign-organic.dc.html` é agora a aplicação.** O arquivo que era o export de canvas (974 KB de React e artboards estáticas) foi substituído pelo shell real — 22 KB que carregam `css/` e `js/`. O `/c` do `vercel.json` passou a apontar para ele, que é o endereço usado pelos **links de inquilino já enviados**; os 6 links da landing também. O **`app.html` virou ponte**: um redirecionamento de 36 linhas, feito em JS e não por `<meta refresh>`, porque o link do inquilino carrega id e chave no **fragmento** (`#tenant?id=&key=`) e fragmento não sobrevive a refresh declarativo — perder isso deixaria o inquilino numa tela de erro com o contrato certo do outro lado.
- **Financeiro voltou** (`js/financeiro.js`, rota `#financial`). Sem migration: a tabela `financial_records`, o CRUD e o `generateMonthlyCharges` nunca saíram em 10/08 — só a view. Régua de meses, quatro métricas, tabela com **situação derivada** ("Atrasado" não existe no banco: é deduzido do vencimento contra hoje), marcar pago/reabrir, gerar cobranças do mês e **exportar CSV** (`;` e vírgula decimal com BOM, que é o que o Excel pt-BR abre sem pedir importação).
- **Vistorias** (`js/vistorias.js`, rota `#vistorias`) — **a única que exigiu banco novo**. `supabase/migrations/004_vistorias.sql` cria `inspections` com RLS de dono, teto de 256 KB no jsonb de ambientes e `check` nos estados; `verificacao.sql` foi de 19 para **23 checagens** (R4.4 — toda migration entra com a checagem dela). Lista + detalhe em duas colunas, ambientes com estado e observações, fechar/reabrir. **Enquanto a migration não for aplicada a tela não quebra:** `Storage.inspectionsDisponivel` fica falso e ela mostra o passo que falta — errar em silêncio aqui significaria o locador achar que salvou uma vistoria que nunca existiu.

**O que continua fora, com o motivo.** **Fotos** — a maquete mostra três por ambiente na vistoria e uma capa por imóvel. Guardar imagem exige um bucket no Supabase Storage com política de dono, teto e limpeza: é superfície de segurança própria, não um campo a mais. Enfiar base64 no jsonb resolveria em uma linha e estouraria a cota do projeto na primeira vistoria de verdade. **Envio automático** de cobrança e de aviso de renovação — não há serviço de envio integrado; as duas telas dizem isso em vez de esconder atrás de um botão morto.

**Verificação.** Os 9 testes passam (`npm test`) — dois arquivos novos nesta rodada (filtro da busca e integridade de tokens/classes) e casos novos no painel (a fila derivada) e no dinheiro. As rotas foram renderizadas em 12 estados e **99 handlers inline disparados um a um: nenhuma falha**. Os três caminhos de entrada conferidos servindo o site: `/redesign-organic.dc.html`, `/c` (a reescrita que os links de inquilino usam) e `/app.html` (a ponte). As rotas painel, contratos, imóveis, clientes, modelos e editor foram renderizadas em Chrome headless com dados de mentira, nos temas claro e escuro, e conferidas por captura; `body.tenant-mode` e `html.is-tenant-boot` foram medidos escondendo `.app-sidebar` e `.content-bar` (as duas regras que o shell novo obrigou a mexer). Sem overflow horizontal até 292px de viewport. O **PDF foi gerado de verdade** pelo caminho de impressão, com teste diferencial: 2 páginas com a regra `@media print` ativa, 3 páginas quando ela é desligada — ou seja, a barra lateral realmente fica fora do documento. Modal de cadastro, tela do inquilino (clara e escura) e celular conferidos por captura. **Não verificado:** o que exige sessão real no Supabase — login, envio e reimportação do link do inquilino ponta a ponta, e o painel de admin.

## 2026-08-10

Aba Financeiro removida e cartão de contrato redesenhado (assets: 1.30.0 → **1.31.0**).

- **A aba Financeiro saiu** (`app.html`, `js/app.js`, `js/financial.js` apagado): fora da topbar, da barra inferior e do roteador — `#financial` agora cai no painel, como qualquer hash desconhecido. **O que ficou de pé de propósito:** a tabela `financial_records` e o CRUD em `Storage` (incluindo `generateMonthlyCharges` e o teste dele). Nenhum lançamento foi apagado e ressuscitar a tela é reverter este commit.
- **Cartão do contrato: fim da informação repetida** (`js/utils.js`, `js/contracts.js`, `js/editor.js`). A mesma data aparecia três vezes por cartão — "Iniciado em" na linha do título e na grade, "Início Locação" ao lado de "Período Vigência", que já começa por ela — e o aluguel aparecia duas. Agora: "Iniciado em" só na grade, um item **Vigência** com o período inteiro, e o aluguel **só no cabeçalho**, com rótulo ("Aluguel mensal") em vez de um número azul solto no canto. Como a regra vale para as três telas que usam `Utils.dadosClienteHTML` (lista, resumo do editor, painel de admin), o resumo do editor ganhou o valor no cabeçalho.
- **Grade alinhada** (`css/dashboard.css`): os dados do locatário eram um `flex-wrap` — cada coluna com a largura do próprio valor, nada batendo de uma linha para a outra. Viraram `grid` com `auto-fit`, que encaixa quatro colunas no desktop e uma no celular sem media query. O endereço do imóvel ocupa duas colunas (era o valor que mais sofria com o corte); o resto corta com reticências e mostra o texto inteiro no `title`, sem tooltip próprio para manter.
- **O aceite do inquilino virou selo** (`js/utils.js`): era um item igual aos outros, com "(não verificado)" escondido no rótulo — a única linha do cartão com peso jurídico tinha o mesmo peso visual que "Profissão". Agora é uma faixa própria: verde quando o carimbo é do servidor (migration 003), âmbar quando só existe o horário do aparelho do inquilino, que ele mesmo escreve. Data quebrada não vira mais "Invalid Date" na tela: o selo simplesmente não sai.
- **Consertos de rota** que apareceram no caminho: `.cliente-resumo` usava `var(--border)` e `var(--bg)`, tokens que não existem — `var()` inválida derruba a declaração inteira, então a caixa de resumo do editor ficava com borda da cor do texto e fundo transparente; `.contract-row` tinha `#F2F4F8` cravado (R6.1), que não escurecia no tema escuro. Os dois passaram a token.
- Checagens novas em `js/prazo.test.js`: aluguel fora da grade, um único item de data, selo verde vs. selo de alerta e data inválida sem saída.

## 2026-08-07 (3)

Fase 2 do plano de segurança — migrations 002 e 003 aplicadas em produção (assets: 1.29.0 → **1.30.0**).

- **A migration 002 nunca tinha sido aplicada em produção.** Descoberto ao rodar o diagnóstico da Fase 0. A política `contracts_select_admin` continuava de pé, liberando `contracts` inteira para o papel de admin — incluindo `cloud_key`, que não é dado, é **credencial**: com `cloud_id` + `cloud_key` qualquer um chama `get_tenant_link` (aberta a anon) de fora do sistema e decifra o conteúdo, sem sessão. Eram 18 links vivos. De quebra, `admin_list_contracts` não existia e o `superadmin.js` já a chamava: **o painel de admin estava quebrado** e ninguém tinha notado. Aplicar a 002 fechou o furo e consertou o painel.
- **Migration 003 — a trilha do aceite passa a ser carimbada pelo servidor.** `aceite_ts`, `ip_acesso` e companhia são escritos no navegador de quem assina e viajam dentro do payload cifrado: o signatário escolhia a data, o IP e as coordenadas que sairiam no certificado, em uma linha de console — justamente a prova que deveria valer contra ele. Agora `finalized_at`/`finalized_ip` nascem no banco, fora do blob, e o certificado do PDF lê esses. Contrato assinado antes disso passa a dizer "Não registrado pelo servidor" em vez de apresentar o autodeclarado como evidência.
- **Migration 003 — escrever no link exige a chave, não só o id.** O `WHERE` de `set_tenant_link` era "id + não expirado + não finalizado": quem tivesse só o id (link encaminhado, print, histórico) sobrescrevia o payload e marcava `finalized` de uma aba anônima, e **nem o locador dono conseguia consertar** — se o inquilino já tinha enviado, a selfie e o aceite sumiam. O cliente passa a mandar `SHA-256(chave)` e o servidor guarda o hash disso: ele nunca aprende a chave, e quem não a tem não escreve. Links criados antes da migration seguem sem a exigência até expirarem (não dava para quebrar quem está com o link na mão).
- **Migration 003 — o `DELETE` saiu da leitura.** `get_tenant_link`, aberta a anon, abria uma transação de escrita a cada chamada. O expurgo passou para o `pg_cron` (confirmado instalado). A função virou `stable`. E `create_tenant_link` ganhou cota por **bytes** (50 MB/usuário): o teto por link e o de 100/dia não limitavam o total, que dava ~1,5 GB por usuário — o triplo da cota do plano que eles deveriam proteger.
- **`verificacao.sql`: de 12 para 19 checagens.** Este é o item que importa mais do que parece: o arquivo aprovava, com "OK — 12 garantias conferidas", um banco em que a 002 nunca fora aplicada. Nenhuma das 12 olhava para ela. As novas 13 a 15 provam a 002, e as 17 a 19 provam a 003. Regra nova em `docs/ARQUITETURA.md` (R4.4): **toda migration entra com a checagem dela no mesmo commit** — verificação que só confere o que já se sabe não prova nada.
- **Fuso do certificado** (`js/utils.js`): a data do aceite era renderizada com `toLocaleString` sem fuso e rotulada "(UTC)". O mesmo aceite imprimia horas diferentes para locador e inquilino, e o rótulo não era verdade em nenhum dos dois. Agora é horário de Brasília, explícito.

## 2026-08-07 (2)

Fase 1 do plano de correções de segurança (assets: 1.28.2 → **1.29.0**). Plano completo em `docs/superpowers/plans/2026-08-07-correcoes-seguranca-console-source.md`; esta rodada é só a parte cliente, sem tocar no banco.

- **O inquilino não reescreve mais o contrato do locador** (`js/utils.js`, `js/editor.js`, `js/app.js`). A regra "ele só preenche a seção Locatário" existia **apenas como filtro de renderização** na tela dele; na volta, o editor fazia `fields = cloudPayload.f`, trocando o objeto inteiro. Quem tivesse o link abria o console, mudava `conta_banco`, e a sincronização automática gravava a conta bancária do atacante no contrato do locador — que saía no PDF, na cláusula "de titularidade do LOCADOR". Agora os dois caminhos de entrada (sincronização do editor e importação por `#import`) passam por `Utils.mesclarCamposDoInquilino`, que só deixa entrar a seção Locatário do modelo mais a trilha do aceite. Coberto por `js/ingestao.test.js`.
- **A chave de decifragem não vai mais para a Meta** (`js/tenant-v2.js`): o link de devolução era colado na query do `wa.me`, e o `encodeURIComponent` transformava o `#` em `%23` — o fragmento, que o resto do sistema mantém fora de requisição de propósito, virava query string num GET para servidor de terceiro, levando junto a chave que decifra o contrato. Passa pelo modal de compartilhamento (cópia local / `navigator.share`).
- **CSP sem curinga** (`app.html`): `connect-src https://*.supabase.co` aceitava qualquer projeto Supabase como destino, inclusive um gratuito do atacante — o "backstop contra exfiltração" não valia nada contra um XSS. Agora é o host exato do projeto. `https://*.ipify.org` saiu por ser redundante com `api.ipify.org`.
- **Repositório sai do deploy** (`.vercelignore`): `/supabase/…`, `/docs/…` e os `.sql` respondiam 200 para qualquer um, entregando esquema, políticas, corpo das funções `SECURITY DEFINER` e os documentos internos com as fraquezas ainda aceitas. Nada disso é lido em runtime. O e-mail real do superadmin saiu do `supabase_admin.sql` (arquivo congelado, não reexecutado — é higiene de segredo, não mudança de banco).
- **Exclusão de conta exige a senha** (`js/admin.js`): a RPC apaga tudo de forma irreversível e é chamável em uma linha de console; digitar "EXCLUIR" prova intenção de quem está na tela, não que a sessão é do dono.
- **Link ilegível não trava mais o contrato** (`js/editor.js`, `js/database.js`): o filtro por mensagem de erro não casava com "Chave do link incorreta", então um payload adulterado deixava o contrato preso a um link morto, sem conseguir gerar outro. De quebra, `loadContract` passa a separar falha de rede de link inexistente — antes as duas davam a mesma mensagem, e uma queda de conexão fazia o editor descartar um link vivo que o inquilino podia estar preenchendo.
- **Escape em atributo** (`js/admin.js`, `js/editor.js`, `js/tenant-v2.js`): os 6 inputs do perfil interpolavam dado em `value="${…}"` sem `Utils.esc`. O check novo em `js/seguranca.test.js` varre o fonte e falha se aparecer `value="${…}"` sem escape — regra sem exceção, então os `<option>` de id e de modelo também passaram a escapar.

**Ainda aberto (Fase 0 e 2 do plano):** a trilha do aceite continua sendo escrita por quem assina, e `set_tenant_link` continua autorizando só pelo `id`, sem a chave. As duas exigem migration. Antes disso é preciso confirmar no SQL Editor se a migration 002 está aplicada em produção — o `verificacao.sql` passa mesmo sem ela.

## 2026-08-07

Barra de abas do mobile, limpeza de emojis e console (assets: 1.28.0 → **1.28.2**; landing 2.0.3 → 2.0.4):

- **`frame-ancestors` saiu da CSP do `<meta>`** (`app.html`): o navegador ignora essa diretiva quando ela vem por `<meta>` — só vale como cabeçalho HTTP — e isso enchia o console com um erro vermelho a cada carregamento. Ela não protegia nada; quem barra iframe de verdade é o `X-Frame-Options: DENY` do `vercel.json`, que continua no lugar. O resto da CSP funciona normalmente por `<meta>`.
- **`console.log` de carga removido** (`js/storage.js`): sobra de depuração que imprimia a contagem de contratos/imóveis/clientes a cada login.

- **A sexta aba sumia em celular estreito** (`css/bottom-nav.css`): os 6 itens eram dimensionados pela largura do próprio conteúdo, que somada passa da tela; a lista transbordava e o `justify-content: space-around` centralizava o excesso, cortando metade do "Painel" à esquerda e o "Perfil" inteiro à direita — por isso só aparecia em aparelho mais largo. Agora cada item é uma fatia igual (`flex: 1` + `min-width: 0`), o rótulo acompanha a fatia (`clamp`, teto nos mesmos 12px de antes) e ganha reticências como rede de segurança. Verificado em Chrome a 320, 360 e 440px: os 6 rótulos cabem inteiros, sem truncar.
- **Emojis removidos do código, da documentação e dos SQL** (`41d9902`): título e cabeçalhos do README, os 9 ícones do preview da landing, os avisos "CONGELADO"/"SOMENTE LEITURA" dos `.sql` e os emojis de `console.log`. Na landing, o campo `icon` saiu junto do `<span>` que o desenhava e da regra `span:first-child` que existia só para dimensioná-lo. O link interno `#-propriedade-intelectual` do README foi corrigido: dependia do emoji no título para resolver. Ficaram de propósito o `✓` das telas de login e do editor e as setas `→` dos docs — são símbolos tipográficos da interface, não emojis.
- O bump de versão desta seção cobre as duas mudanças: `41d9902` entrou sem bump, e sem ele o CSS e o JS novos não chegariam a quem já abriu o site.

## 2026-08-05

Rodada P2 + migration 002 (assets: 1.27.1 → **1.28.0**; landing 2.0.2 → 2.0.3):

- **Admin não lê mais `cloud_key`** (`supabase/migrations/002`): a política de leitura do admin liberava a tabela `contracts` inteira, incluindo a chave AES dos links. Isso não é só mais um dado pessoal — é credencial: com `cloud_id` + `cloud_key` qualquer um chama `get_tenant_link` (executável por anônimo) de fora do sistema e decifra o conteúdo, sem sessão. Agora o painel lê por `admin_list_contracts()`, que devolve só as colunas de supervisão. **Rode a migration ANTES de publicar o JS** — nessa ordem o painel falha para o lado seguro. Não dava para resolver com permissão por coluna: o próprio locador precisa ler o `cloud_key` dele para regerar links, e ambos são o mesmo papel no banco.
- **Termos de uso corrigidos num ponto factualmente falso**: a cláusula 5 afirmava que a chave de decifragem "não é armazenada por nós", quando ela é gravada junto ao contrato do locador (é o que permite reabrir e regerar o link). O texto agora descreve o alcance real da criptografia — protege contra a exposição isolada da tabela de links, e **não** é ponta a ponta. Mesma correção no README.
- **CSS fora do JavaScript** (`css/auth.css`): as 141 linhas de estilo que viviam numa string dentro do `auth.js` viraram arquivo. Efeito colateral revelador — como esse CSS era invisível para qualquer análise de folhas de estilo, a auditoria tinha concluído que a fonte Instrument Serif era carregada à toa; ela é usada justamente ali, na tela de login.
- **`fonts.css` por `<link>` em vez de `@import`**: entra no cache-busting (antes trocar uma fonte nunca chegava a quem já tinha visitado) e para de serializar o download, que atrasava o primeiro texto na tela. De quebra, some o import duplicado no app.
- **`npm test`** roda os 5 checks de uma vez, com CI no GitHub Actions a cada push e PR. O `package.json` não traz dependência nenhuma — o projeto continua sem build.
- **Código morto removido**: `Utils.contractRow` (abstração criada e nunca usada) e `Utils.escapeHtml` (apelido sem chamador). O fluxo legado base64 **ficou**: não é código morto, é a mensagem que explica ao usuário por que um link antigo não abre mais.
- **README reescrito**: descrevia um sistema menor do que o que existe — sem os módulos de Imóveis/Clientes/Financeiro, sem o painel de admin e afirmando que "não há assinatura eletrônica", quando há assinatura eletrônica simples com trilha de auditoria (o que não há é assinatura qualificada ICP-Brasil).

Regime de migrations (P1 #10 — fecha o backlog P1; assets: 1.27.0 → 1.27.1):

- **`supabase/migrations/001_baseline.sql`**: retrato do banco de produção, consolidando o que os 6 SQL congelados deixaram espalhado e divergente. Registra `tenant_links.id` como **TEXT** — o DDL histórico dizia `uuid` e foi exatamente essa divergência que derrubou o envio do inquilino em produção. Serve para provisionar projeto novo; em produção já está aplicado, não precisa rodar. O e-mail do admin ficou de fora de propósito (é dado, não estrutura: versionado, daria admin a quem tivesse aquele endereço num projeto novo) — o comando está comentado no fim do arquivo.
- **Raiz = histórico congelado, `supabase/` = executável.** `supabase_verificacao.sql` virou `supabase/verificacao.sql`; convenção de migrations documentada em `supabase/README.md` (numeradas, idempotentes, nunca editadas depois de aplicadas, verificação depois de cada uma).
- Comentário obsoleto em `database.js` que ainda dizia `create_tenant_link recebe p_id uuid` — a função recebe `text` desde 30/07. É o tipo de comentário que gera o próximo bug.
- `docs/ARQUITETURA.md` atualizado: §8 deixa de descrever "estado perigoso" e as dívidas P0/P1 saem do backlog para a seção "Pagas".
- **Baseline validado contra produção**: `supabase/verificacao.sql` rodado no SQL Editor — as 12 garantias de segurança conferidas. O `001_baseline.sql` está confirmado fiel ao banco real, não só ao que os SQL congelados descreviam.

Rodada P1 da arquitetura — consolidação (assets do app: 1.26.1 → 1.27.0):

- **Preview do contrato unificado** (`Utils.updateContractPreview`): editor do locador e tela do inquilino carregavam ~80 linhas idênticas copiadas — mudar o texto de garantia exigia editar dois arquivos. Agora o documento é preenchido por uma função só; cada tela mantém apenas seu sinal de campo vazio e, no editor, o certificado.
- **Regra única de "contrato ativo"**: `generateMonthlyCharges` tinha definição própria (`isFinalized || nome_locatario`) e gerava cobrança até de contrato vencido; agora usa a mesma regra de datas dos badges (`Utils.getContractStatus`). Com teste em `properties.test.js`.
- **Parser de dinheiro único** (`Utils.parseMoneyBRL`): eram 4 cópias (dashboard, storage ×2, financial). De quebra, `SuperAdmin` deixa de depender de `Dashboard.parseValor` — e o teste agora falha se alguém reintroduzir a dependência.
- **Busca de CEP única** (`Utils.applyCEPToInput`): eram 3 cópias do mesmo fluxo (editor, imóveis, inquilino).
- **Rotas blindadas**: `#editor` sem parâmetro dava TypeError (tela branca); `#tenant` com parâmetro desconhecido não renderizava nada; `#import` vivia fora da tabela de rotas — virou rota normal com método próprio (`App.handleImport`).

Rodada P0 da arquitetura (assets do app: 1.26.0 → **1.26.1**):

- **SQL congelados e README corrigido**: aviso de NÃO EXECUTAR no topo dos 7 `supabase_*.sql` (só `supabase_verificacao.sql`, somente leitura, continua executável) — reexecutar `schema`/`rls`/`finalize` regredia a segurança de `tenant_links`, e o README ainda mandava rodar `supabase_rls.sql`. De quebra, corrigidos no README o "DDL não versionado" (está versionado desde 21/07) e os "90 dias" de link.
- **Headers de segurança na Vercel** (`vercel.json`): `X-Frame-Options: DENY` (o `frame-ancestors` via `<meta>` é ignorado pelos navegadores — o app estava enquadrável em iframe), `nosniff`, `Referrer-Policy` e HSTS. `Permissions-Policy` ficou de fora de propósito: o fluxo do inquilino usa câmera e GPS.
- **Fim da perda silenciosa de dados**: falha ao salvar/excluir imóvel, cliente, lançamento ou perfil agora avisa com toast — antes só ia para o console e o dado sumia no reload. Rota única de erro (`Storage._cloudWrite`), incluindo o `.catch` de rede que essas escritas nem tinham.
- **Vazamento de cache na troca de conta**: `Storage.clearAll()` zera os 5 caches (antes zerava só contratos e perfil — imóveis/clientes/financeiro de A podiam renderizar para B se a recarga falhasse). Com teste em `properties.test.js`.
- **`termos.html` dizia 90 dias de expiração do link; o banco pratica 30** desde o endurecimento de 30/07. Documento jurídico realinhado ao sistema.

- **Arquitetura de referência**: criado `docs/ARQUITETURA.md` — mapa fiel do sistema como é (módulos, estado, dados, segurança, CSS, deploy), regras normativas daqui pra frente (camadas, banco por migrations, invioláveis de segurança, tokens, versionamento, testes), backlog de dívidas priorizado (P0 a P3) e checklist de processo para toda mudança. Motivo: o sistema em produção vinha crescendo por mudanças ad-hoc; agora há uma linha única — mudança que contraria o documento, ou muda o documento primeiro, ou não entra. Achados críticos registrados lá: rodar `supabase_rls.sql` hoje REABRE furos de segurança (o README ainda manda rodar), Vercel sem headers HTTP (clickjacking possível), escrita silenciosamente perdível em 4 das 5 entidades, e `termos.html` prometendo retenção de 90 dias quando o banco pratica 30.

## 2026-07-30

- **Este changelog**: criado para o time ter uma referência única de tudo que já foi feito no sistema, atualizado a cada rodada de mudanças daqui em diante — de qualquer pessoa do time.
- **Contrato não virava "Ativo" sozinho** (`b5a1e78`): a data de término só era calculada quando alguém mexia manualmente num campo do editor; contrato salvo sem esse gatilho ficava "Pendente" para sempre mesmo com prazo válido — e por tabela, o imóvel vinculado nunca virava "Alugado" sozinho. Corrigido na função compartilhada de status, não em cada tela que a usa.
- **Endurecimento de segurança** (`a4058f4` … `b5a1e78`): auditoria encontrou a tabela de links do inquilino listável e gravável por qualquer um com a chave pública do projeto — sem precisar da chave de criptografia do link em si — e pontos de XSS armazenado onde um inquilino mal-intencionado podia rodar código dentro da sessão do locador. Corrigido: acesso anônimo direto à tabela fechado (só as 3 funções que já filtram por id continuam liberadas); teto de 512 KB por link; retenção 90 → 30 dias com expurgo automático; sanitização do payload do inquilino na entrada e nos pontos de exibição; aviso de coleta de IP/GPS antes do envio. No caminho, achado e corrigido um bug que travava o envio do inquilino em produção (`596ca9d`: coluna `text` sendo tratada como `uuid`). Testado direto contra produção (com a chave pública, antes e depois) — furos fechados, fluxo do inquilino intacto. Design e plano documentados em `docs/superpowers/specs/` e `docs/superpowers/plans/`.
- **Vínculo imóvel-contrato** (`d89c155`): "Importar Imóvel" grava o vínculo no contrato; status do imóvel (Alugado/Disponível) passa a ser automático; card do imóvel mostra inquilino atual, total de contratos e receita recebida.
- **Correções de UX** (`7bfe8ee`): assinatura manuscrita centralizada sobre a linha; CEP no cadastro de imóvel via ViaCEP; "Importar Imóvel" não preenchia os dados do contrato (bug na conversão do valor do aluguel).

## 2026-07-29

- **Cadastro automático do inquilino em Clientes** (`8c6e7f8`): contrato salvo com inquilino não cadastrado cria o cliente automaticamente (idempotente por CPF/CNPJ).
- **Assinatura do locador** (`c8878fe`): locador também assina o contrato, com pad manuscrito no editor.
- **Correções** (`4714010`): CEP antes do endereço nos modelos; flash da interface do locador no link do inquilino; bug de tipo (text vs uuid) que travava o envio do inquilino em produção.

## 2026-07-24

- Campo de busca do painel de admin alinhado à coluna central (`1c2aa27`).

## 2026-07-23

- **Módulos de Imóveis, Clientes e Financeiro** (`577ad9a`): novos módulos de ERP, com padronização visual em relação ao resto do sistema.
- Fundo do modal cobre a tela inteira (`b0da7ef`).

## 2026-07-22

Dia mais intenso do projeto até aqui:

- Painel de administrador com visão de todas as contas (`22fa2e5`) → vira ficha de suporte completa por conta (`1bac142`) → divulgação progressiva para reduzir a densidade de informação (`1c68fe9`).
- Flash da interface do locador no link do inquilino + troca de emojis por ícones (`7a2220d`).
- Locador passa a escolher quais métodos de validação exigir do inquilino: assinatura e/ou selfie (`476bc17`).
- Consulta ViaCEP, tratamento de erros no storage, formatação do certificado no PDF (`bfcb1e5`).
- Redesign "Planta Baixa e Mesa de Controle" com nova topbar (`b315dfd` — Allan); remoção de módulos legados e refatoração geral (`f0890fc` — Allan); resolução de conflitos de merge (`1e2fddb`, `e5ea7c3` — Allan); correções de atributo `hidden` no CSS e metadados do perfil (`df35024` — Allan).
- Dois redeploys forçados no Vercel (`5f47dcd`, `962c7eb`).

## 2026-07-21

- Modelo comercial completo: garantias locatícias (caução/fiador), assinatura digital manuscrita, schema Supabase (`1ef29e5`).
- Trilha de auditoria: IP, GPS e hash SHA-256 do aceite + validação por selfie (`cb3c688`).
- CSP liberando os domínios de IP/CEP; captura de IP/GPS mais confiável (`cb2b840`).
- Data de início do contrato exibida no painel e na lista de clientes (`9cd2b7c`).
- Modal de compartilhamento para celular + melhorias de segurança (`0d74def`).
- Correção de estouro de pilha ao cifrar payloads grandes com selfie, com otimização de imagem (`d544362`).
- LGPD: termos de uso e melhorias de segurança (`1f41443` — Allan).

## 2026-07-20

- Remoção da UI antiga; migração para RPCs do Supabase com escape de XSS (`982be7c` — Allan).
- README completo + LICENSE (`03d3717` — Allan); três atualizações de logotipo para SVG (`b91258e`, `92d85ac`, `5e1637c` — Allan).
- Modo escuro / dark mode (`d301165` — Allan).
- Trava pós-aceite (link do inquilino vira somente leitura após o envio), prazos personalizados, correção de timezone, URL curta no Vercel (`63a9414`).

## 2026-06-30 a 2026-07-17

- Landing page como página inicial; app movido para `app.html` (`c31abd4`, `32e6ab1` — Allan) — 30/06.
- Correção do botão "Sair da Conta" ficando ativo indevidamente no dashboard (`d839486` — Allan) — 03/07.
- Modo offline-first, métricas de contratos no dashboard, primeiros testes automatizados (`2975efd` — Allan); limpeza de código morto e versão de assets v1.1.2 (`48caa21` — Allan) — 13/07.
- Refatoração da experiência do inquilino, sistema de toast, otimização da exportação de PDF (`7d8b9d0` — Allan) — 15/07.
- Suporte a locador Pessoa Jurídica, fluxo de recuperação de senha (`afa81e2` — Allan) — 16/07.
- **Migração para Supabase**: autenticação, banco de dados, editor e tenant v2 refeitos (`c7579fd` — Allan); IDs criptográficos e rótulo CPF/CNPJ dinâmico conforme tipo de locador (`980e949` — Allan); política de senha nos formulários (`97e9c8a` — Allan); SQL de RLS do Supabase (`7a91848`) — 17/07.

## 2026-06-23

Dia de migração de infraestrutura, com idas e vindas:

- Links seguros para inquilinos com criptografia AES-GCM (`d82a560`).
- Tentativa de migração para Firebase Firestore com painel de login (`7b06512`) — **revertida no mesmo dia** em favor do Supabase (`a2aa946`).
- Status visual dos contratos e valor por extenso (`f97f6fa`).
- Correções no cadastro: confirmação de e-mail pendente, tradução de erros, rate limit (`3cd4d11`, `5481dd3`, `7bc1833`).

## 2026-05-21 a 2026-05-29 — Início do projeto

- Commit inicial do repositório (`ff215d6` — Allan) e gerador de contratos com suporte a tenant admin (`6bdcd00`).
- Sessão longa de ajustes de PDF (dezenas de commits no mesmo dia, comprimidos aqui): da geração via `html2pdf` — com sucessivos problemas de corte de página, tela branca e cache do navegador — até a migração definitiva para `window.print` nativo (`cbbdaf7` — Allan), que resolveu qualidade e cortes de uma vez. Blow-by-blow completo em `git log` no intervalo `a6b007e..986a96c`.
- Migração do banco de contratos para XML via `DOMParser` (`a6b007e`).
- UX mobile: bottom navigation, bottom sheet do contrato, correções de FAB e menu hambúrguer (`0d7881a`, `1389084`, `b450cd4`, `1f51cf8`, `8fd59d7` — Allan).
- Tema claro institucional, tipografia padronizada (fonte Outfit), README inicial (`9cd6c5d`, `fd51942`, `38ce741`, `8021078` — Allan).
- Nova aba de gestão de contratos por categoria (`f92898e` — Allan).
- Acessibilidade: aria-labels e remoção de estilos inline (`d7a03d7` — Allan), cache-busting nas importações de CSS/JS (`f966892` — Allan) — 22/05.
- Exclusão de um `.docx` de contrato real que tinha ido parar no repositório por engano (`81276a3`) — 29/05.
