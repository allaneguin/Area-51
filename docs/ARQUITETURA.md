# Arquitetura — Meus Imóveis

**Versão 1.0 — 2026-08-05.** Fonte única da linha arquitetural do sistema.

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

---

# Parte I — O sistema como é

## 1. Visão geral

Aplicação web de **geração e gestão de contratos de locação**: o locador monta o contrato, envia um link cifrado ao inquilino, que preenche os próprios dados no celular e devolve; o locador importa e imprime em PDF. Em volta do contrato cresceu um mini-ERP: imóveis e clientes (a tela de financeiro saiu em 10/08 — a tabela `financial_records` e o CRUD em `Storage` continuam de pé, sem view).

```
┌────────────────────── Vercel (estático) ──────────────────────┐
│  index.html (landing)   app.html (SPA)   termos.html (LGPD)   │
│  rewrite /c → app.html                                        │
└───────────────────────────────┬───────────────────────────────┘
                                │ @supabase/supabase-js (CDN)
┌───────────────────────────────▼───────────────────────────────┐
│                    Supabase (único backend)                   │
│  Auth (e-mail/senha)                                          │
│  Postgres + RLS: contracts · profiles · tenant_links          │
│                  properties · clients · financial_records     │
│  RPCs (SECURITY DEFINER): create/set/get_tenant_link,         │
│                  delete_own_account, admin_list_users         │
│  pg_cron: expurgo diário de links expirados (03:15)           │
└───────────────────────────────────────────────────────────────┘
```

**Stack:** HTML, CSS e JavaScript puros — sem framework, sem build, sem `package.json`. Única dependência externa: `@supabase/supabase-js@2.110.7` via jsDelivr. Criptografia com WebCrypto nativo. Deploy estático na Vercel.

## 2. Páginas

| Página | Papel | Observações |
|---|---|---|
| `index.html` | Landing (marketing) | CSS próprio (`landing.css`, track de versão `2.0.2`), um script inline, nenhum JS da aplicação. Sempre escura. |
| `app.html` | A aplicação (SPA por hash) | Shell fixo + `<main id="main-content">` vazio; todo conteúdo é injetado por JS. CSP em `<meta>`. Assets com `?v=1.26.0`. |
| `termos.html` | Termos de uso + privacidade | Autônoma: estilo inline próprio, zero scripts, `noindex`. Minuta com campos `[PREENCHER]`. |

## 3. Módulos JS — camadas reais

~5.900 linhas em 15 módulos de produção + `data/contracts.js` (modelos) + 6 arquivos de teste. Cada módulo é um `const Objeto = {...}` no escopo global de script clássico (não `window.X`); os ~85 handlers `onclick` inline resolvem pela cadeia de escopo — é por isso que a CSP mantém `'unsafe-inline'`.

| Camada | Arquivos | Papel |
|---|---|---|
| Config | `supabase-config.js` | Cria o client; URL + chave publicável hardcoded (pública por design). |
| Dados | `storage.js` (`Storage`), `database.js` (`CloudDB`) | `Storage`: cache em memória + CRUD de contracts, properties, clients, financial_records, profiles. `CloudDB`: AES-GCM + as 3 RPCs de link + sanitização de fronteira — o arquivo mais coeso do repo. |
| Domínio/UI misturados | `utils.js` (`Utils`) | Máscaras, CPF/CNPJ, datas, prazo, status do contrato, tema, escape/XSS, toast, assinatura, compartilhamento, IP/GPS, ViaCEP, certificado HTML. Seis módulos em um. |
| Dados de modelo | `data/contracts.js` (`Contracts`) | 3 modelos (residencial, comercial, minuta simples): metadados + campos + template HTML. Puro. |
| Views | `dashboard.js`, `contracts.js` (`ContractsView`), `properties.js`, `clients.js`, `templates.js`, `admin.js`, `superadmin.js`, `editor.js`, `tenant-v2.js`, `auth.js` | Uma por rota. `editor.js` e `tenant-v2.js` são os maiores (~730-750 linhas cada). `auth.js` carrega 141 linhas de CSS em string e uma animação de canvas. |
| Shell | `app.js` (`App`) | Router por hash + guarda de login + ciclo de sessão + fluxo `#import` inline. |

**Comunicação:** acesso direto a objetos globais; não há eventos nem pub/sub. Estado compartilhado principal: `Storage.*Cache` (5 caches), `App.user`, `Editor.contract`, `Tenant.contract`.

**Ordem de carga (`app.html`):** só duas dependências são reais — o CDN do Supabase precisa vir **antes e sem `defer`** (o `supabase-config.js` o usa durante a carga), e `app.js` vem por último (registra `DOMContentLoaded`). Os demais 15 arquivos podem ser reordenados livremente: as referências cruzadas só rodam em tempo de chamada.

## 4. Roteamento

Hash routing em `app.js`: `#dashboard` (default), `#properties`, `#clients`, `#templates`, `#contracts`, `#editor?id=|template=`, `#admin`, `#superadmin`, `#tenant?id=&key=` e `#import?id=&key=` (rota normal, despachada para `App.handleImport`). Guardas em ordem: recuperação de senha → login (`#tenant` é a única rota pública) → modo tenant (esconde o shell).

Parâmetro ausente ou inválido redireciona (editor) ou mostra erro (inquilino); hash desconhecido cai no dashboard sem aviso — aceito, não é erro do usuário.

## 5. Estado e sincronização

**Não é offline-first** (apesar do histórico). O modelo real é: **Supabase é a fonte da verdade; cache em memória hidratado uma vez por sessão** (`Storage.loadCloudData` a cada troca real de usuário); **escrita otimista fire-and-forget** — o cache muda primeiro, a promise do Supabase roda sem `await`, sem rollback.

- Erros de escrita passam todos por `Storage._cloudWrite`: falha vira toast, nunca só `console.error`.
- `localStorage`: apenas `theme`, `perfil_pendente` (cadastro sem sessão) e `tenant_draft_<id>` (rascunho do inquilino, sem assinatura/selfie de propósito).
- Na troca de conta, `App` chama `Storage.clearAll()` — os 5 caches vão junto.

## 6. Modelo de dados

| Tabela | Natureza | Chave |
|---|---|---|
| `contracts` | Metadados tipados + **`fields jsonb`, o blob central**: dados das partes, valores, prazos, `property_id`, assinaturas, selfie, trilha de aceite (IP/GPS/hash/UA), reajustes | `id text` gerado no cliente |
| `profiles` | `profile_data jsonb` (perfil inteiro como blob) | `id uuid` = `auth.users.id` |
| `tenant_links` | `encrypted_payload` (AES-GCM, ≤ 512 KB), `finalized`, `expires_at` (30 dias), `created_by` | `id text` guardando uuid gerado por CSPRNG no cliente |
| `properties`, `clients`, `financial_records` | ERP com **colunas tipadas** (não JSON) | `id text` gerado no cliente |

**Vínculos apenas lógicos (sem FK):** contrato→imóvel via `fields->>'property_id'`; `financial_records.contract_id` é texto solto; cliente↔contrato casa por CPF/CNPJ; `contracts.cloud_id` é `uuid` e `tenant_links.id` é `text` — convivem porque o cliente sempre gera uuid válido, mas o join em SQL exige `::text`. Únicas FKs reais: `user_id`/`created_by` → `auth.users` com cascade.

## 7. Segurança

**A chave anon é pública; toda a segurança é RLS.** O cliente é fail-closed (sem SDK, não abre o painel).

- **Papéis: dois, não três.** Locador comum (RLS por `auth.uid()`) e admin (claim `role='admin'` em `app_metadata` — `user_metadata` não autoriza, e isso é coberto por teste). "Superadmin" é só o nome do módulo. O admin é somente leitura: lê `profiles` por política e os contratos pela função `admin_list_contracts()`, que **não devolve `cloud_key`** (migration 002). Não enxerga o ERP.
- **`tenant_links`: RLS ligada com ZERO políticas** + revoke geral. Todo acesso passa pelas 3 RPCs `SECURITY DEFINER`: `create_tenant_link` (só autenticado, teto 512 KB, 100 links/dia), `set_tenant_link` (anon, só não-finalizado, encurta expiração ao assinar), `get_tenant_link` (anon, expurga expirados, lê finalizado de propósito para reabertura/importação).
- **Link do inquilino:** chave de 16 caracteres CSPRNG (~95 bits, zero-padded para AES-256), IV de 12 bytes por operação, transporte no fragmento da URL (`#tenant?id=&key=`) — não vai em request nem Referer. `id`+`key` funcionam como bearer token: o banco cobra o id, o AES cobra a chave. A chave fica **em claro** em `contracts.cloud_key` (risco aceito e registrado na spec de 30/07).
- **Todo dado vindo do inquilino é hostil.** Duas camadas anti-XSS, ambas testadas: sanitização na fronteira (`CloudDB._sanitizeDeep` dentro do `decrypt` — `data:` que não seja imagem aprovada vira string vazia) + `Utils.imgSeguro`/`Utils.esc` nos pontos de exibição. Desde 07/08, `js/seguranca.test.js` varre o fonte e falha se aparecer `value="${…}"` sem `Utils.esc` — **regra sem exceção**, inclusive para id e `<option>` de modelo estático, porque invariante com lista de casos abençoados não se mantém.
- **O que o inquilino escreve é lista branca, não filtro de tela** (07/08). A regra "só a seção Locatário" vale na **ingestão** (`Utils.mesclarCamposDoInquilino`), pela qual passam os dois caminhos de entrada: a sincronização de fundo do editor e a importação por `#import`. Antes ela existia só no filtro de renderização da tela do inquilino, e quem abrisse o console reescrevia a conta bancária de recebimento do locador.
- **CSP** em `<meta>` no `app.html`: `unsafe-inline` é consequência estrutural dos handlers inline; o valor real está em `connect-src`/`form-action`. `frame-ancestors` **saiu** — via `<meta>` o navegador ignora a diretiva (e ainda registrava erro no console); quem protege contra clickjacking é o `X-Frame-Options: DENY` enviado pela Vercel (`vercel.json`), junto com `nosniff`, `Referrer-Policy` e HSTS. `connect-src` lista o **host exato** do projeto Supabase, nunca `*.supabase.co`: com o curinga, um XSS exfiltrava para um projeto gratuito do atacante e a diretiva não valia nada. Trocar de projeto Supabase exige mudar `app.html` e `js/supabase-config.js` juntos. Domínios externos e o porquê (R5.5): `api.ipify.org` e `ipapi.co` (IP da trilha de aceite, o segundo é reserva do primeiro), `viacep.com.br` (busca de CEP), `cdn.jsdelivr.net` (SDK do Supabase, em `script-src`).

## 8. SQL — histórico congelado, migrations daqui pra frente

Os seis `supabase_*.sql` da raiz têm **definições conflitantes do mesmo objeto** — rodar `supabase_schema.sql`, `supabase_rls.sql` ou `supabase_finalize.sql` REGREDIRIA a segurança (reabre enumeração/escrita anônima, ou derruba o teto de 512 KB e a retenção de 30 dias). Por isso estão **congelados**, cada um com aviso no topo, e servem só como registro histórico.

O que é executável vive em `supabase/`: `migrations/001_baseline.sql` (retrato do banco em 05/08, com `tenant_links.id text` — o DDL histórico dizia `uuid` e isso já derrubou produção) e `verificacao.sql` (19 checagens, somente leitura). O banco passa a ser a soma das migrations, na ordem; convenção em `supabase/README.md`.

## 9. CSS, tokens e assets

- 11 arquivos, "um por área" com vazamentos: `dashboard.css` funciona como segunda `components.css` (`.stats-grid` é usada por 5 módulos); impressão espalhada em 5 blocos; `.preview-document` tem dois donos.
- **Tokens duplicados em três lugares sem ligação:** `index.css` (`:root`, app), `landing.css` (escopo `.lp`) e o `<style>` inline de `termos.html`. Trocar a marca exige editar os três.
- Dark mode: tokens em `[data-theme="dark"]` + anti-FOUC inline; as folhas de área funcionam só por herança de token (disciplina boa). Landing e termos não têm dark mode (deliberado e acidental, respectivamente).
- **Cache-busting manual:** 27 ocorrências de `?v=` no `app.html` (hoje `1.28.0`) + track independente na landing (`2.0.3`). Falha silenciosa e assimétrica: esquecer um bump deixa usuário antigo com asset velho. Os `.woff2` seguem sem versão, mas mudam de fato ~nunca e agora são invalidados junto com `fonts.css`.

## 10. Testes

5 arquivos standalone rodados por **`npm test`** (sem framework e sem dependência — leem o fonte e avaliam com `new Function`), com CI no GitHub Actions a cada push e PR. Todos passam hoje. Cobrem funções puras (prazo, datas, dinheiro, status), a superfície de segurança (anti-XSS nas duas camadas, `isAdmin`) e, desde 05/08, `clearAll` e a regra de cobrança mensal. **Zero cobertura nos 3 maiores arquivos** (editor, tenant, auth — ~2.100 linhas somadas). Sem `npm test`, sem CI.

---

# Parte II — A linha (regras daqui pra frente)

## R1 — Stack

Vanilla JS sem build continua sendo a arquitetura oficial (decisão da seção 0). Nenhuma dependência nova sem passar pelo checklist da Parte IV; a régua é: plataforma nativa primeiro, depois o que já está instalado, biblioteca nova só com justificativa registrada aqui.

## R2 — Camadas e dependências permitidas

```
Shell (App) ──► Views ──► UI compartilhada (toast, modal, tema, certificado)
                  │
                  ├─────► Núcleo puro (máscaras, CPF/CNPJ, datas, dinheiro,
                  │        prazo, status, modelos) — sem DOM, sem rede
                  │
                  └─────► Dados (Storage, CloudDB) ──► Supabase
```

Setas só nessa direção. Em particular:

1. **Dados nunca chamam UI.** `Storage`/`CloudDB` não disparam toast nem tocam DOM; devolvem erro/promise e a view decide o que mostrar.
2. **Toda escrita de dados passa por `Storage`; todo acesso a `tenant_links` passa por `CloudDB`.** Nenhum módulo fala com `supabaseClient` direto além desses dois (exceções existentes: `auth`, `admin`, `superadmin` — toleradas por serem Auth/RPCs próprias, não dados).
3. **Nenhum módulo escreve no cache de outro.** `Storage` expõe método para limpar os caches; `App` chama o método, não os campos.
4. **View só mexe no próprio DOM**, dentro de `#main-content`, no ciclo de render dela. Precisa de re-render? Via rota (`App.handleRoute`) ou re-render explícito da própria view — nunca `document.body`.
5. **Regra de negócio não mora em view nem em `Storage`.** Cálculo (status, cobrança, reajuste, parse de dinheiro) mora no núcleo puro e é testável com `node`.

## R3 — Estado

Supabase é a fonte da verdade; o cache é derivado e descartável. Três obrigações:

1. **Toda falha de escrita chega ao usuário** (toast no mínimo). `console.error` sozinho é proibido — é assim que dado some em silêncio.
2. **Troca de conta zera TODOS os caches**, num único método de `Storage`.
3. Escrita otimista é aceita (padrão atual), mas escrita nova de dado crítico (contrato, financeiro) deve tratar o erro — informar e oferecer repetir.

## R4 — Banco de dados

1. **Os `supabase_*.sql` da raiz estão CONGELADOS** — registro histórico, nunca mais rodam. Aviso no topo de cada um. Raiz = histórico; `supabase/` = executável.
2. Toda mudança de banco daqui pra frente = **novo arquivo `supabase/migrations/NNN_descricao.sql`**, numerado, idempotente, que nunca é editado depois de aplicado. O que o banco é hoje = a soma das migrations.
3. `migrations/001_baseline.sql` é o retrato do banco em 05/08 (com `tenant_links.id text`, corrigindo o DDL histórico). Serve para provisionar projeto novo; produção já o tem aplicado.
4. `supabase/verificacao.sql` (somente leitura) roda depois de cada migration aplicada — e **toda migration nova entra com a checagem dela nesse arquivo, no mesmo commit**. Sem isso a verificação vira teatro: em 07/08 ela aprovou por meses um banco sem a 002 (ver seção 15).
5. Coluna nova que precise de consulta, índice ou integridade → **coluna tipada**; JSON (`fields`) é só para o conteúdo do formulário do contrato. Vínculo novo entre tabelas → FK real.
6. `id text` gerado no cliente é o padrão estabelecido — manter, não misturar com uuid novo sem migração planejada.

## R5 — Segurança (invioláveis)

1. RLS é a única barreira — qualquer tabela nova nasce com RLS ligada e políticas de dono.
2. `tenant_links` permanece com **zero políticas**; acesso só via as 3 RPCs. Teto de 512 KB não cai.
3. Autorização só por `app_metadata` (JWT). `user_metadata` e `profile_data` nunca autorizam nada.
4. Todo dado do inquilino é hostil: sanitização na fronteira (`CloudDB`) **e** escape no sink (`Utils.esc`/`imgSeguro`). `innerHTML` com dado externo sem escape é bug de segurança, não de estilo.
5. CSP não regride: nenhum domínio novo em `connect-src`/`script-src` sem registrar aqui o porquê.
6. Nenhum segredo no repositório além da chave publicável do Supabase.

## R6 — CSS e tokens

1. **Tokens só em `index.css :root`** (e `[data-theme="dark"]`). Nenhum hex novo fora de token — exceção precisa de comentário justificando (ex.: tooltip sobre fundo sempre-escuro).
2. Um arquivo por área; o que 2+ áreas usam mora em `components.css`. Se um seletor de `dashboard.css` for usado por outra view, ele muda de arquivo.
3. Estilos de impressão: concentrados nos blocos já documentados (`components.css` base + via de cada área), nunca num arquivo novo.
4. CSS não mora em string JS (dívida atual do `auth.js` — não repetir).

## R7 — Versionamento de assets e release

1. **Um track de versão por página**: `app.html` (`?v=X.Y.Z`) e `index.html` (`?v=`) — como hoje, mas com regra: **toda mudança de CSS/JS bumpa o track inteiro da página afetada** (os 25 valores do app sobem juntos; buscar e substituir).
2. O número da versão entra no CHANGELOG do dia — é o elo entre versão em produção e commit.
3. Correção estrutural planejada (P2): bloco `headers` no `vercel.json` com `Cache-Control` de revalidação, que elimina o esquema manual sem criar build step.

## R8 — Testes

1. **Regra nova ou alterada no núcleo puro = caso de teste** no `*.test.js` correspondente, no padrão atual (node standalone, sem framework).
2. Os testes todos rodam antes de qualquer commit que toque JS: `for f in js/*.test.js; do node "$f" || exit 1; done` (ou o equivalente no PowerShell). Um script `test.ps1`/`package.json` mínimo pode formalizar isso (P2).
3. Segurança tem prioridade de cobertura: qualquer mudança em `CloudDB`, sanitização ou `isAdmin` exige teste novo junto.

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
| 18 | Headers de cache na Vercel substituindo o `?v=` manual. | R7.3 | Mexer em semântica de cache de um site em produção sem poder observar o CDN é a troca errada. Fazer quando houver um deploy acompanhado. |

## P3 — decisões de produto (exigem decisão do time)

- **`termos.html` é minuta** com `[PREENCHER]`: razão social, CNPJ, nome do DPO e e-mail de contato. É a maior pendência aberta — política de privacidade de sistema que já processa CPF, RG, selfie, IP e GPS de terceiros. Só vocês têm esses dados.
- **Assinatura**: o produto entrega assinatura eletrônica **simples** (manuscrita + aceite + trilha de IP/GPS/hash/selfie), válida entre as partes que a aceitam (MP 2.200-2, art. 10 §2), mas **não qualificada (ICP-Brasil)**. Decisão: fica assim, ou entra integração com provedor (ZapSign, Clicksign, D4Sign)? Construir ICP-Brasil internamente não é o caminho.
- **Landing**: "Planos" é uma âncora para um CTA sem nenhum plano, e "grátis" hoje é verdade (não há cobrança). Não é falso, é vago — alinhar quando houver decisão de monetização.
- **Admin não enxerga o ERP** (sem políticas de admin em properties/clients/financial_records) — intencional ou lacuna?
- **`cloud_key` em claro no banco**: mitigado pela migration 002 (admin não lê mais), mas continua legível por quem tenha acesso à base. Cifrar em repouso exigiria uma chave fora do banco — projeto próprio, não uma linha de SQL.

---

# Parte IV — Processo para qualquer mudança

Checklist, na ordem. É deliberadamente curto — o objetivo é caber no hábito, não burocratizar.

1. **Precisa existir?** Se é especulação ("vai que um dia..."), não entra. Registre a ideia no CHANGELOG como descartada, se valer o registro.
2. **Já existe?** Procure helper/padrão no núcleo antes de escrever (`Utils`, `Storage`, `CloudDB`, `components.css`). A duplicação nasce aqui.
3. **Em que camada mora?** (R2). Regra de negócio → núcleo puro. Dados → `Storage`/`CloudDB`. Tela → view da rota. Na dúvida, a resposta certa é a que permite testar com `node`.
4. **Toca banco?** → migration numerada nova (R4), nunca editar SQL congelado. Toca dado do inquilino? → as duas camadas de sanitização (R5).
5. **Teste** para regra nova/alterada (R8) e rodar os 6 existentes.
6. **Bump de versão** do track da página afetada (R7).
7. **CHANGELOG** com o quê e o porquê, citando a versão (R9).
8. **Este documento**: se a mudança contraria alguma regra daqui, o doc muda primeiro ou a mudança não entra.
