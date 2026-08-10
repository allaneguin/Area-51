# Changelog — Meus Imóveis

Registro de todas as alterações do sistema, para o time ter uma referência única do que já foi feito e por quê — não importa se a mudança foi feita manualmente ou com apoio de IA, todo pedido de alteração entra aqui.

**Convenção para quem for atualizar este arquivo:**
- Mais recente primeiro.
- Uma seção por dia (`## AAAA-MM-DD`).
- Cada linha cita o hash do commit entre parênteses — quem quiser o detalhe roda `git show <hash>`.
- Uma ou duas linhas por mudança bastam: o quê, e o porquê quando não for óbvio. Não precisa ser extenso.

> Anterior a 20/07: reconstruído a partir do `git log`, sem o contexto das conversas que geraram cada commit — resumos fiéis às mensagens originais.

---

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
