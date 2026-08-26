# Arquitetura — Meus Imóveis

**Versão 2.0 — 2026-08-26.** Fonte única da linha arquitetural do sistema.

> **Mudança de fundação em 26/08:** a Supabase saiu. O backend passou a ser um
> processo Node/Express próprio com SQLite. Este documento foi reescrito, não
> emendado — a Parte I inteira descrevia a Supabase e teria virado ficção.

**Como usar este documento:**

- **Parte I** descreve o sistema como ele é hoje — mapa fiel, incluindo os defeitos.
- **Parte II** define as regras que valem daqui pra frente (a "linha").
- **Parte III** lista onde o código de hoje viola essas regras, em ordem de prioridade.
- **Parte IV** é o checklist que toda mudança segue antes de entrar.

**Regra de manutenção:** se uma mudança contraria a Parte II, primeiro se muda este documento (decisão consciente, registrada no CHANGELOG) — ou a mudança não entra. Assim o documento nunca vira ficção.

---

## 0. Decisão de fundação

Três caminhos foram avaliados para "voltar ao início e ter uma arquitetura":

| Caminho | O que seria | Veredito |
|---|---|---|
| **A. Manter a stack e formalizar** | Continuar vanilla JS sem build; escrever as regras, consolidar duplicações e pagar dívidas por prioridade | **Escolhido.** O sistema está em produção e funciona; o problema relatado não é a stack, é a falta de linha. Risco mínimo. |
| B. Modularizar com build | Migrar para ES Modules + bundler (Vite), hash de assets automático | Adiar. Resolve cache-busting e ordem de scripts, mas exige reescrever os ~85 handlers `onclick` inline e re-testar tudo. Só compensa quando o time crescer ou o custo do esquema atual doer de verdade. |
| C. Reescrever com framework | React/Vue/Svelte do zero | Rejeitado. Reescrever um sistema em produção para ganhar o que já se tem é o clássico erro de segunda versão. |

**Critérios para reavaliar (sair de A para B):** mais de ~3 pessoas commitando JS ao mesmo tempo, ou dois incidentes causados por versão de asset/ordem de script no mesmo trimestre.

## 0.1 Backend próprio — decisão de 2026-08-26

A stack do front continua sendo a do Caminho A. O que mudou foi o backend.

| Caminho | O que seria | Veredito |
|---|---|---|
| **Node + Express + `node:sqlite`** | Um processo, um arquivo de banco, uma dependência | **Escolhido.** SQL de verdade sem serviço externo e sem compilação nativa no Windows. |
| Node puro, zero dependências | `node:http` + `node:sqlite` | Rejeitado por pouco: economiza uma dependência e custa ~60 linhas de roteamento e parsing. |
| Node + Postgres | Mais perto do que havia e do que escala | Adiado. Exige subir e manter um Postgres para o sistema ligar; a mesma resposta com mais infraestrutura nesta fase. |

**O que a decisão custou, registrado:** a redefinição de senha por e-mail deixou de existir — quem enviava o e-mail era a Supabase, e não há serviço de envio. A tela saiu em vez de ficar como botão que não chega a lugar nenhum.

**Consequência de deploy:** a Vercel serve estático e funções sem estado; um processo com banco em arquivo não roda lá. O `vercel.json` saiu do repositório. **Hoje o sistema roda local** (`npm start`); quando o deploy voltar à pauta, o candidato é host com disco persistente. Isso é assunto de outro spec.

**Critérios para reavaliar (sair de SQLite para Postgres):** mais de um processo servindo a mesma base, ou necessidade de acesso concorrente de escrita a partir de máquinas diferentes.

---

# Parte I — O sistema como é

## 1. Visão geral

Aplicação web de **geração e gestão de contratos de locação**: o locador monta o contrato, envia um link cifrado ao inquilino, que preenche os próprios dados no celular e devolve; o locador importa e imprime em PDF. Em volta do contrato há um mini-ERP: imóveis, clientes, financeiro, renovações e vistorias.

```
┌──────────────────── Node + Express (server/) ─────────────────────┐
│  express.static → public/   (app.html · index.html · termos.html) │
│                                                                   │
│  /api/auth      registrar · entrar · sair · sessao · senha · conta│
│  /api/perfil    o perfil da sessão (sem :id — ver §6)             │
│  /api/:recurso  contracts · properties · clients ·                │
│                 financial_records · inspections                   │
│  /api/links     link do inquilino (PÚBLICO — ele não tem conta)   │
│  /api/admin     supervisão de contas (somente leitura)            │
└───────────────────────────────┬───────────────────────────────────┘
                                │ node:sqlite
┌───────────────────────────────▼───────────────────────────────────┐
│  data.db — 9 tabelas. Escopo por usuário é do SERVIDOR, não do    │
│  banco: não há RLS. Ver §7.                                       │
└───────────────────────────────────────────────────────────────────┘
```

**Stack:** HTML, CSS e JavaScript puros no front — sem framework, sem build, **sem nenhuma dependência de runtime**. Backend em Node com **uma** dependência (Express); banco pelo `node:sqlite` da própria stdlib; senha e sessão pelo `node:crypto`. Criptografia do link com WebCrypto nativo no navegador.

## 2. Páginas

Todas em `public/`, servidas por `express.static`.

| Página | Papel | Observações |
|---|---|---|
| `index.html` | Landing (marketing) | CSS próprio (`landing.css`), um script inline, nenhum JS da aplicação. Sempre escura. |
| `app.html` | A aplicação (SPA por hash) | Shell fixo + `<main id="main-content">` vazio; todo conteúdo é injetado por JS. CSP em `<meta>`. Assets com `?v=2.0.0`. Barra lateral escura no desktop (`.app-sidebar`) mais `.content-bar` com a busca; no celular, `.mobile-header` + `.bottom-nav`. |
| `termos.html` | Termos de uso + privacidade | Autônoma: estilo inline próprio, zero scripts, `noindex`. Minuta com campos `[PREENCHER]`. |

O arquivo `redesign-organic.dc.html` (export de canvas que virou o shell em 24/08) foi renomeado para `app.html` em 26/08, junto com a saída da Supabase. Não havia mais link em circulação a preservar, e o nome era resíduo de maquete.

## 3. Módulos — camadas reais

### Front (`public/js/`)

~7.100 linhas em 17 módulos de produção + `data/contracts.js` (modelos) + 9 arquivos de teste. Cada módulo é um `const Objeto = {...}` no escopo global de script clássico (não `window.X`); os ~85 handlers `onclick` inline resolvem pela cadeia de escopo — é por isso que a CSP mantém `'unsafe-inline'`.

| Camada | Arquivos | Papel |
|---|---|---|
| Transporte | `api.js` (`Api`) | Fala com `/api`. Substituiu o `supabaseClient` em 26/08. **Não imita a interface dele de propósito** — não há `.from().select().eq()`: um shim com aquele formato daria o menor diff e faria quem lesse o código procurar uma Supabase que não existe mais. |
| Dados | `storage.js` (`Storage`), `database.js` (`CloudDB`) | `Storage`: cache em memória + CRUD. `CloudDB`: AES-GCM + as rotas de link + sanitização de fronteira. |
| Domínio/UI misturados | `utils.js` (`Utils`) | Máscaras, CPF/CNPJ, datas, prazo, status, tema, escape/XSS, toast, assinatura, IP/GPS, ViaCEP, certificado. Seis módulos em um (dívida P2 #11). |
| Dados de modelo | `data/contracts.js` (`Contracts`) | 3 modelos (`locacao_residencial`, `locacao_comercial`, `locacao_simples`). Puro. |
| Views | `dashboard.js`, `contracts.js` (`ContractsView`), `financeiro.js`, `renovacoes.js`, `vistorias.js`, `properties.js` (`PropertiesView`), `clients.js` (`ClientsView`), `templates.js`, `admin.js`, `superadmin.js`, `editor.js`, `tenant-v2.js`, `auth.js` | Uma por rota. `editor.js` e `tenant-v2.js` são os maiores (~670-680 linhas cada). |
| Shell | `app.js` (`App`) | Router por hash + guarda de login + ciclo de sessão + fluxo `#import` inline. |

**Ordem de carga (`app.html`):** `api.js` vem antes de `storage.js`/`database.js`/`auth.js`, que o usam; `app.js` vem por último (registra `DOMContentLoaded`). Os demais podem ser reordenados: as referências cruzadas só rodam em tempo de chamada. Não há mais CDN externo — todo script é do próprio site.

### Backend (`server/`)

| Arquivo | Papel |
|---|---|
| `index.js` | Express, monta as rotas, serve `public/`, envia os cabeçalhos de segurança que antes vinham do `vercel.json`. |
| `db.js` | Abre o `data.db`, cria o schema no boot, e define o mapa `RECURSOS` — **a única lista branca de nome de tabela que vira SQL**. |
| `sessao.js` | `scrypt` + cookie de sessão + `exigirLogin`/`exigirAdmin`. |
| `rotas/auth.js` | Contas e sessão. |
| `rotas/perfil.js` | Perfil do locador — fora da família de recursos (ver §6). |
| `rotas/recursos.js` | CRUD genérico das 5 tabelas, com escopo por sessão. |
| `rotas/links.js` | Link do inquilino. Público. |
| `rotas/admin.js` | Supervisão de contas, somente leitura. |

## 4. Roteamento

Hash routing em `app.js`: `#dashboard` (default), `#financial`, `#renovacoes`, `#vistorias`, `#properties`, `#clients`, `#templates`, `#contracts`, `#editor?id=|template=`, `#admin`, `#superadmin`, `#tenant?id=&key=` e `#import?id=&key=` (rota normal, despachada para `App.handleImport`). Guardas em ordem: recuperação de senha → login (`#tenant` é a única rota pública) → modo tenant (esconde o shell).

Parâmetro ausente ou inválido redireciona (editor) ou mostra erro (inquilino); hash desconhecido cai no dashboard sem aviso — aceito, não é erro do usuário.

## 5. Estado e sincronização

**Não é offline-first.** O modelo é: **o servidor é a fonte da verdade; cache em memória hidratado uma vez por sessão** (`Storage.loadCloudData` a cada troca real de usuário); **escrita otimista fire-and-forget** — o cache muda primeiro, a chamada roda sem `await`, sem rollback.

- Erros de escrita passam todos por `Storage._cloudWrite`: falha vira toast, nunca só `console.error`. Desde 26/08 ele distingue **recusa do servidor** de **falha de rede** (`err.transporte`), porque só uma delas se resolve recarregando.
- A sessão vive num **cookie `httpOnly`**: não há token em `localStorage` e o JS não alcança a sessão. Com `unsafe-inline` na CSP, essa flag é a única coisa entre um XSS e a conta.
- `localStorage`: apenas `theme`, `perfil_pendente` (cadastro) e `tenant_draft_<id>` (rascunho do inquilino, sem assinatura/selfie de propósito).
- `Api.aoMudarSessao` ocupa o lugar de `auth.onAuthStateChange`. Diferença de fundo: a Supabase reemitia sozinha (refresh de token ~1x/h, refoco de aba) com o mesmo usuário, e o `app.js` tinha de filtrar para não destruir formulário em edição. Agora só emite quando algo muda, porque só emitimos nós.
- Na troca de conta, `App` chama `Storage.clearAll()`.

## 6. Modelo de dados

`data.db` (SQLite), schema criado no boot. Nove tabelas.

| Tabela | Natureza | Chave |
|---|---|---|
| `users` | e-mail, `senha_hash` + `salt` (scrypt), `is_admin`, `ultimo_login` | `id text` (uuid do servidor) |
| `sessions` | `token`, `user_id`, `expira_em` | `token` |
| `contracts` | Metadados tipados + **`fields`, o blob central**: dados das partes, valores, prazos, `property_id`, assinaturas, selfie, trilha de aceite, reajustes | `id text` gerado no cliente |
| `profiles` | O perfil inteiro como blob | `id` = `users.id` |
| `tenant_links` | `encrypted_payload` (AES-GCM, ≤ 512 KB), `key_proof`, `finalized`, `finalized_at`/`finalized_ip`, `expires_at` (30 dias) | `id text` (uuid do CSPRNG do cliente) |
| `properties`, `clients`, `financial_records`, `inspections` | ERP com **colunas tipadas** | `id text` gerado no cliente |

**JSON vs coluna.** `contracts.fields`, `profiles.profile_data` e `inspections.rooms` são conteúdo de formulário, variam por contrato/imóvel e nada neles é consultado por SQL — é o caso em que R4.5 permite JSON. No SQLite eles são `text`.

**A armadilha do jsonb, e onde ela se conserta.** O PostgREST devolvia `jsonb` **já parseado**; o SQLite devolve **string**. Se isso passar, `contract.fields.valor_aluguel` vira `undefined` em todas as telas e nada acusa — a tela só mostra vazio. Por isso `db.js` declara, por recurso, quais colunas são JSON e quais são boolean, e **a conversão acontece na resposta do servidor**, não em `storage.js`. É a mesma classe do bug de dinheiro 100× (numeric serializado como string): o tipo muda na borda, e a borda é onde se conserta. Coberto por teste (`fields volta como OBJETO, nao string`).

**`profiles` fica fora da família de recursos.** Não tem coluna `user_id` — a chave primária *é* o usuário. Encaixá-la no CRUD genérico exigiria uma exceção dentro do middleware de escopo, que é justamente a função onde exceção não pode entrar. Por isso tem rotas próprias **sem `:id`**: o único perfil que a sessão alcança é o dela, e sem parâmetro não há id de outra conta para tentar passar.

**Vínculos apenas lógicos (sem FK):** contrato→imóvel via `fields->>'property_id'`; `financial_records.contract_id` é texto solto; cliente↔contrato casa por CPF/CNPJ. Únicas FKs reais: `user_id`/`created_by` → `users` com cascade.

## 7. Segurança

**A garantia que era do banco passou a ser código.** Enquanto o backend era a Supabase, quem impedia a conta A de ler a conta B era a RLS do Postgres — uma parede do banco, que valia mesmo se o servidor errasse. Agora quem garante é `server/rotas/recursos.js`. Uma garantia que virou código precisa virar teste junto, senão o que se fez foi trocar uma parede por uma intenção: os testes de escopo em `server/servidor.test.js` são essa troca sendo cobrada.

- **O escopo é de um middleware só.** `router.use(exigirLogin)` é a primeira linha do router de recursos; todo SQL de lá leva `user_id = ?` com o id **da sessão**. Handler nenhum lê usuário do corpo ou da query. É por ser um só que se pode afirmar que substitui a RLS — verificação repetida em cada handler é a que alguém esquece de repetir, e a esquecida é a que vaza.
- **Gravar por id de outra conta é 403; apagar é 404.** O `upsert` por id deixaria B sobrescrever a linha de A só sabendo o id (e ids são gerados no cliente e viajam em link). Na exclusão o retorno é 404 de propósito: dizer "existe, mas não é seu" já conta que aquele id existe em alguma conta.
- **Papéis: dois.** Locador comum e admin (coluna `is_admin`). O `SuperAdmin.isAdmin()` do front é **só cosmético** — esconde o item de menu; quem barra é o `exigirAdmin` do servidor, que reconsulta o banco a cada rota e não confia em nada que o navegador afirme. O admin é somente leitura, **nunca recebe `cloud_key`** e **não enxerga o ERP**.
- **Senha:** `scrypt` do `node:crypto`, salt de 16 bytes por usuário, comparação com `timingSafeEqual`. Login com e-mail inexistente e com senha errada dão a **mesma** resposta — distinguir os dois transforma o login num verificador de quem tem conta. Trocar a senha derruba as outras sessões.
- **Link do inquilino:** rotas públicas por definição (ele não tem conta). Chave de 16 caracteres CSPRNG (~95 bits), IV de 12 bytes por operação, transporte no fragmento da URL — não vai em request nem Referer. O servidor **nunca vê o conteúdo**: guarda bytes cifrados no navegador. `key_proof` é o que separa "tem o link" de "tem só o id", e o banco guarda **SHA-256 da prova**, não a prova — quem lê a base não consegue escrever no link. `finalized` é caminho só de ida. `finalized_at`/`finalized_ip` são carimbados pelo servidor, fora do payload cifrado: é a única parte da trilha que quem assina não redige. Expurgo dos expirados acontece **na leitura** (substituiu o `pg_cron` das 03:15 — tabela lida a cada acesso não precisa de agendador).
- **Todo dado vindo do inquilino é hostil.** Duas camadas anti-XSS, ambas testadas: sanitização na fronteira (`CloudDB._sanitizeDeep` dentro do `decrypt`) + `Utils.imgSeguro`/`Utils.esc` nos sinks. `js/seguranca.test.js` varre o fonte e falha se aparecer `value="${…}"` sem `Utils.esc` — regra sem exceção.
- **O que o inquilino escreve é lista branca, não filtro de tela.** A regra vale na **ingestão** (`Utils.mesclarCamposDoInquilino`), pela qual passam os dois caminhos de entrada. Verificado em 26/08 contra o backend novo: um inquilino que envia `conta_locador`, `nome_locador` e `valor_aluguel` forjados não altera nenhum dos três.
- **CSP:** com a saída da Supabase ficou mais curta e mais forte — `script-src` sem CDN externo, `connect-src` sem host de terceiro guardando dado. Sobraram `api.ipify.org`/`ipapi.co` (IP da trilha) e `viacep.com.br`. `unsafe-inline` continua por causa dos handlers inline: dívida conhecida. `frame-ancestors` não vale por `<meta>` — quem barra clickjacking é o `X-Frame-Options: DENY` que o `server/index.js` envia, junto com `nosniff` e `Referrer-Policy`.
- **Nenhum segredo no repositório.** Com a Supabase saiu a última chave versionada. `data.db` está no `.gitignore`.

## 8. Schema — criado no boot, sem sistema de migration

O schema vive em `server/db.js` e nasce com `create table if not exists` a cada boot. **Não há sistema de migration**, e isso é decisão, não esquecimento: com um arquivo de banco local e sem dado que não se possa recriar, migration numerada é cerimônia. O regime anterior (`supabase/migrations/` + `verificacao.sql`, 23 checagens) existia porque havia um Postgres em produção que não se podia recriar.

**Quando isto muda:** no dia em que existir um banco com dado que não se pode perder — primeiro deploy real com usuário de verdade. Aí volta um regime de migration, e a R4 volta a valer na forma antiga.

Os seis `supabase_*.sql` da raiz e a pasta `supabase/` inteira foram **apagados** em 26/08, junto com `js/supabase-config.js`, `vercel.json` e o `app.html` que era ponte de redirecionamento.

## 9. CSS, tokens e assets

- 11 arquivos, "um por área" com vazamentos: `dashboard.css` funciona como segunda `components.css` (`.stats-grid` é usada por 5 módulos); impressão espalhada em 5 blocos; `.preview-document` tem dois donos.
- **Tokens duplicados em três lugares sem ligação** (e, desde o redesenho de 24/08, o app e a landing são identidades **diferentes** de propósito — o app usa a paleta "grafite" com Instrument Sans; a landing seguiu na Schibsted Grotesk): `index.css` (`:root`, app), `landing.css` (escopo `.lp`) e o `<style>` inline de `termos.html`. Trocar a marca exige editar os três.
- Dark mode: tokens em `[data-theme="dark"]` + anti-FOUC inline; as folhas de área funcionam só por herança de token (disciplina boa). Landing e termos não têm dark mode (deliberado e acidental, respectivamente).
- **Cache-busting manual:** 26 ocorrências de `?v=` no `app.html` (hoje `1.32.0`) + track independente na landing (`2.0.3`). Falha silenciosa e assimétrica: esquecer um bump deixa usuário antigo com asset velho. Os `.woff2` seguem sem versão, mas mudam de fato ~nunca e agora são invalidados junto com `fonts.css`.

## 10. Testes

**44 testes**, todos por `npm test`, sem framework e sem dependência de teste. CI no GitHub Actions a cada push e PR.

- **Backend — 35 casos** (`server/servidor.test.js`, `node:test`): sobem o app num banco descartável e falam com ele por HTTP. Cobrem o escopo por usuário nas 5 tabelas e no perfil (o que substitui a RLS), senha e sessão, o ciclo do link do inquilino (prova de chave, finalizar só de ida, expiração, teto de 512 KB), a forma da resposta (`fields` como objeto) e as regras de admin.
- **Front — 9 arquivos standalone**: leem o fonte e avaliam com `new Function`. Cobrem funções puras (prazo, datas, dinheiro, status), a superfície de segurança (anti-XSS nas duas camadas, `isAdmin`), `clearAll`, a cobrança mensal, o filtro da busca, o formato de dinheiro e a integridade dos tokens de tema.

**Zero cobertura automatizada nos 3 maiores arquivos do front** (editor, tenant, auth — ~1.900 linhas). Eles são verificados por auditoria de runtime, não por teste: em 26/08 as 10 rotas foram renderizadas e **37 handlers inline disparados um a um, sem falha e sem erro de console**, e o fluxo do inquilino foi percorrido ponta a ponta num navegador de verdade.

---

# Parte II — A linha (regras daqui pra frente)

## R1 — Stack

Vanilla JS sem build continua sendo a arquitetura do front (seção 0). O backend é Node + Express + `node:sqlite` (seção 0.1).

**A régua para qualquer dependência nova, dos dois lados: plataforma/stdlib primeiro, depois o que já está instalado, biblioteca nova só com justificativa registrada aqui.** O backend nasceu com uma dependência (Express) e o front com nenhuma — é assim que fica até haver motivo escrito.

Em particular: senha (`scrypt`), banco (`node:sqlite`), sessão (`randomBytes`), hash (`createHash`) e servidor HTTP já vêm da stdlib. Trocar qualquer um por biblioteca exige registrar o porquê.

## R2 — Camadas e dependências permitidas

```
Shell (App) ──► Views ──► UI compartilhada (toast, modal, tema, certificado)
                  │
                  ├─────► Núcleo puro (máscaras, CPF/CNPJ, datas, dinheiro,
                  │        prazo, status, modelos) — sem DOM, sem rede
                  │
                  └─────► Dados (Storage, CloudDB) ──► Api ──► /api ──► server/
```

Setas só nessa direção. Em particular:

1. **Dados nunca chamam UI.** `Storage`/`CloudDB` não disparam toast nem tocam DOM; devolvem erro/promise e a view decide o que mostrar.
2. **Toda escrita de dados passa por `Storage`; todo acesso a `tenant_links` passa por `CloudDB`.** Só `Storage`, `CloudDB`, `auth`, `admin`, `superadmin` e `app` falam com `Api`; view nenhuma chama `fetch` nem `Api` direto.
3. **`Api` não imita backend nenhum.** Se um dia o backend trocar de novo, `Api` muda por dentro e as assinaturas ficam — foi o que permitiu a saída da Supabase sem tocar nas 10 views. O que não se faz é um objeto que finge ser o cliente de um serviço que não está mais lá.
4. **Nenhum módulo escreve no cache de outro.** `Storage` expõe método para limpar os caches; `App` chama o método, não os campos.
5. **View só mexe no próprio DOM**, dentro de `#main-content`, no ciclo de render dela.
6. **Regra de negócio não mora em view nem em `Storage`.** Cálculo (status, cobrança, reajuste, parse de dinheiro) mora no núcleo puro e é testável com `node`.
7. **No backend, rota não fala com o banco por conta própria.** Nome de tabela vem do mapa `RECURSOS` em `db.js` e de lugar nenhum mais.

## R3 — Estado

O servidor é a fonte da verdade; o cache é derivado e descartável. Três obrigações:

1. **Toda falha de escrita chega ao usuário** (toast no mínimo). `console.error` sozinho é proibido — é assim que dado some em silêncio. E a mensagem distingue **recusa do servidor** de **falha de rede**: só uma delas se resolve recarregando.
2. **Troca de conta zera TODOS os caches**, num único método de `Storage`.
3. Escrita otimista é aceita (padrão atual), mas escrita nova de dado crítico (contrato, financeiro) deve tratar o erro — informar e oferecer repetir.

## R4 — Banco de dados

1. **O schema mora em `server/db.js`** e nasce no boot (`create table if not exists`). Não há sistema de migration — decisão registrada na seção 8, não esquecimento.
2. **A regra acima tem prazo de validade.** No primeiro deploy com dado real de usuário, volta um regime de migration numerada + verificação, e este item é reescrito **antes** desse deploy, não depois.
3. **Nome de tabela nunca é concatenado a partir de entrada do cliente.** O mapa `RECURSOS` em `db.js` é a única lista branca; recurso fora dela é 404 antes de virar SQL.
4. **Coluna JSON é declarada no mapa**, com a conversão de borda junto. Coluna JSON que o servidor não declare volta como string para o front e quebra a tela em silêncio (seção 6).
5. Coluna nova que precise de consulta, índice ou integridade → **coluna tipada**; JSON é só para conteúdo de formulário. Vínculo novo entre tabelas → FK real.
6. `id text` gerado no cliente é o padrão estabelecido — manter. `users.id` é a exceção: gerado no servidor, porque o cliente não pode escolher a própria identidade.

## R5 — Segurança (invioláveis)

1. **O escopo por usuário é de UM middleware.** Toda rota de recurso passa por `exigirLogin` e todo SQL leva `user_id` **da sessão**. Rota que precise de exceção a isso não entra pela família de recursos — ganha rotas próprias, como `profiles` ganhou. Exceção dentro da função que garante o escopo é onde o furo nasce.
2. **Isso vale porque tem teste.** Enquanto era RLS, a garantia era do banco e valia mesmo com o servidor errado. Virou código: **mudança em `rotas/recursos.js` ou em `sessao.js` exige teste de escopo junto**, sem exceção.
3. `tenant_links` só é alcançada por `rotas/links.js`. Teto de 512 KB não cai; `key_proof` não vira opcional; `finalized` não deixa de ser só de ida; o carimbo de evidência não sai de dentro do servidor.
4. **Autorização só pelo que o servidor consulta no banco.** `is_admin` vem de `users`, reconsultada a cada rota. Nada que o navegador afirme autoriza — `SuperAdmin.isAdmin()` é cosmético e o servidor não sabe que ele existe.
5. Todo dado do inquilino é hostil: sanitização na fronteira (`CloudDB`) **e** escape no sink (`Utils.esc`/`imgSeguro`). `innerHTML` com dado externo sem escape é bug de segurança, não de estilo. A lista branca da ingestão (`mesclarCamposDoInquilino`) **fecha por padrão**: entrada que ela não reconhece não passa.
6. CSP não regride: nenhum domínio novo em `connect-src`/`script-src` sem registrar aqui o porquê. Os cabeçalhos de segurança saem de `server/index.js` — some de lá, some do site.
7. **Nenhum segredo no repositório.** `data.db` fica no `.gitignore`. Senha só como `scrypt` + salt; comparação sempre com `timingSafeEqual`.

## R6 — CSS e tokens

1. **Tokens só em `index.css :root`** (e `[data-theme="dark"]`). Nenhum hex novo fora de token — exceção precisa de comentário justificando (ex.: tooltip sobre fundo sempre-escuro).
2. Um arquivo por área; o que 2+ áreas usam mora em `components.css`. Se um seletor de `dashboard.css` for usado por outra view, ele muda de arquivo.
3. Estilos de impressão: concentrados nos blocos já documentados (`components.css` base + via de cada área), nunca num arquivo novo.
4. CSS não mora em string JS (dívida atual do `auth.js` — não repetir).

## R7 — Versionamento de assets e release

1. **Um track de versão por página**: `app.html` (`?v=X.Y.Z`, hoje `2.0.0`) e `index.html`. **Toda mudança de CSS/JS bumpa o track inteiro da página afetada** (buscar e substituir).
2. O número da versão entra no CHANGELOG do dia — é o elo entre versão em produção e commit.
3. Correção estrutural planejada (P2 #18): `Cache-Control` de revalidação nos cabeçalhos que `server/index.js` envia, eliminando o `?v=` manual sem criar build step. Ficou mais barata do que era: agora os cabeçalhos são nossos, não de configuração de CDN que não se pode observar.

## R8 — Testes

1. **Regra nova ou alterada no núcleo puro = caso de teste** no `*.test.js` correspondente (node standalone, sem framework).
2. **Rota nova = teste de rota**, sempre incluindo: exige sessão? respeita o escopo? A pergunta "essa rota vaza dado de outra conta?" tem de ter resposta executável, não opinião.
3. `npm test` roda backend e front juntos e passa antes de qualquer commit que toque código.
4. Segurança tem prioridade de cobertura: mudança em `CloudDB`, em sanitização, em `isAdmin`, no middleware de escopo ou nas rotas de link exige teste novo junto.
5. Os três maiores arquivos do front seguem sem cobertura automatizada (editor, tenant, auth). Enquanto for assim, mudança neles pede **auditoria de runtime** — abrir o app, percorrer as rotas, disparar os handlers — e o resultado vai no CHANGELOG.

## R9 — Documentação

1. **CHANGELOG.md a cada rodada de mudanças** (regra já vigente).
2. Este documento é atualizado quando a linha mudar — na mesma rodada.
3. README e termos.html não podem contradizer o sistema real (resta o P2 #15).

---

# Parte III — Dívidas: onde o hoje viola a linha

Backlog priorizado. Cada item aponta a regra que viola. Pagar de cima para baixo; itens independentes podem ir em rodadas separadas — **sempre uma dívida por vez, com teste e changelog**, nunca "aproveitando" para mexer em mais coisas (é exatamente o hábito que este documento existe para encerrar).

## Pagas — 2026-08-05

**P0 (commit `82bc273`, assets 1.26.1):** os 6 `supabase_*.sql` da raiz congelados com aviso no topo e README corrigido (mandava rodar `supabase_rls.sql`, que regredia a segurança); headers de segurança no `vercel.json`; `Storage._cloudWrite` acaba com a perda silenciosa de imóveis/clientes/financeiro/perfil; `Storage.clearAll()` fecha o vazamento de cache entre contas; `termos.html` realinhado a 30 dias.

**P1 (commits `9e26b21` e `5a12fc2`, assets 1.27.1):** `Utils.updateContractPreview` elimina a duplicação de ~80 linhas entre editor e inquilino; `generateMonthlyCharges` passa a usar a regra única de "ativo" (`Utils.getContractStatus`); `Utils.parseMoneyBRL` substitui 4 parsers e `Utils.applyCEPToInput` substitui 3 fluxos de CEP; rotas blindadas e `#import` promovida a rota normal; `supabase/migrations/001_baseline.sql` + `supabase/verificacao.sql` estabelecem o regime de migrations (R4 passa a valer).

**Validado em produção (2026-08-05):** `supabase/verificacao.sql` rodado no SQL Editor — as 12 garantias de então conferidas, baseline confirmado fiel ao banco real.

**Furo do próprio processo, descoberto em 2026-08-07:** a validação acima passou, e mesmo assim a **migration 002 nunca tinha sido aplicada em produção** — `contracts_select_admin` continuava de pé (admin lendo `cloud_key`, que é credencial anon-utilizável) e `admin_list_contracts` não existia, o que deixava o painel de admin quebrado sem ninguém notar. Nenhuma das 12 checagens olhava para a 002. A lição não é "esqueceram de rodar": é que **verificação que só confere o que já se sabe não prova nada**. Toda migration nova passa a entrar com a sua checagem correspondente no `verificacao.sql`, no mesmo commit (R4.4).

**P2 e migration 002 (commit da rodada de 05/08, assets 1.28.0):** CSS do `auth.js` extraído para `css/auth.css` (#12); código morto removido (#13); README reescrito e fiel (#15); `npm test` + CI no GitHub Actions (#16); `fonts.css` passa a ser `<link>` versionado em vez de `@import` (#17). Migration `002` tira `cloud_key` do alcance do admin.

## P2 — o que sobrou

| # | Dívida | Regra | Por que ficou |
|---|---|---|---|
| 11 | Dividir `utils.js` (~780 linhas, 6 responsabilidades) em núcleo puro vs UI compartilhada. | R2 | **Adiado por risco.** Todo call site usa `Utils.x`; separar em dois objetos seria um diff de centenas de linhas sobre código sem cobertura de teste. O ganho é organizacional, o risco é funcional. Fazer junto com a primeira necessidade real de mexer ali. |
| 14 | `dashboard.css` é uma segunda `components.css` disfarçada (`.stats-grid` usada por 5 módulos): mover o que é compartilhado. | R6.2 | Mover regras entre folhas muda a ordem da cascata; sem teste visual, o risco não compensa fora de uma mudança de layout já planejada. |
| 18 | `Cache-Control` de revalidação substituindo o `?v=` manual. | R7.3 | Ficou mais barato depois de 26/08: os cabeçalhos passaram a ser do `server/index.js`, não de configuração de CDN. Fazer quando houver um deploy acompanhado. |

## P3 — decisões de produto (exigem decisão do time)

- **`termos.html` é minuta** com `[PREENCHER]`: razão social, CNPJ, nome do DPO e e-mail de contato. É a maior pendência aberta — política de privacidade de sistema que já processa CPF, RG, selfie, IP e GPS de terceiros. Só vocês têm esses dados.
- **Assinatura**: o produto entrega assinatura eletrônica **simples** (manuscrita + aceite + trilha de IP/GPS/hash/selfie), válida entre as partes que a aceitam (MP 2.200-2, art. 10 §2), mas **não qualificada (ICP-Brasil)**. Decisão: fica assim, ou entra integração com provedor (ZapSign, Clicksign, D4Sign)? Construir ICP-Brasil internamente não é o caminho.
- **Landing**: "Planos" é uma âncora para um CTA sem nenhum plano, e "grátis" hoje é verdade (não há cobrança). Não é falso, é vago — alinhar quando houver decisão de monetização.
- **Admin não enxerga o ERP** — **resolvido como intencional em 26/08**: não existe rota de admin para imóvel, cliente, financeiro ou vistoria, e a ausência virou teste. Supervisão de contas não é acesso ao negócio alheio.
- **`cloud_key` em claro no banco**: o admin não a lê (garantido por teste), mas continua legível por quem tenha o arquivo `data.db`. Cifrar em repouso exige uma chave fora do banco — projeto próprio. **Ficou mais urgente depois de 26/08:** antes era uma linha num Postgres gerenciado; agora é um arquivo na máquina que roda o servidor.
- **Redefinição de senha por e-mail** (aberta desde 26/08): saiu junto com a Supabase, que era quem enviava o e-mail. Decisão pendente: entra serviço de envio (Resend/SendGrid/SMTP) ou fica com redefinição pelo admin?
- **Deploy** (aberta desde 26/08): o sistema roda local. A Vercel não serve um processo com banco em arquivo. Escolher host com disco persistente, ou voltar a um banco gerenciado.

---

# Parte IV — Processo para qualquer mudança

Checklist, na ordem. É deliberadamente curto — o objetivo é caber no hábito, não burocratizar.

1. **Precisa existir?** Se é especulação ("vai que um dia..."), não entra. Registre a ideia no CHANGELOG como descartada, se valer o registro.
2. **Já existe?** Procure helper/padrão no núcleo antes de escrever (`Utils`, `Storage`, `CloudDB`, `components.css`). A duplicação nasce aqui.
3. **Em que camada mora?** (R2). Regra de negócio → núcleo puro. Dados → `Storage`/`CloudDB`. Tela → view da rota. Na dúvida, a resposta certa é a que permite testar com `node`.
4. **Toca banco?** → schema em `server/db.js` + entrada no mapa `RECURSOS` se for tabela de recurso (R4). Toca dado do inquilino? → as duas camadas de sanitização (R5). Toca rota? → teste de sessão e de escopo (R8.2).
5. **Teste** para regra nova/alterada (R8) e rodar `npm test` inteiro.
6. **Bump de versão** do track da página afetada (R7).
7. **CHANGELOG** com o quê e o porquê, citando a versão (R9).
8. **Este documento**: se a mudança contraria alguma regra daqui, o doc muda primeiro ou a mudança não entra.
