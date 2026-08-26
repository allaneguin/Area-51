# Backend próprio — saída da Supabase

**2026-08-26.** Substituir a Supabase por um backend Node/Express com SQLite,
mantendo o front-end atual funcionando sem alteração nas telas.

---

## 1. Decisão e contexto

O sistema hoje é estático (Vercel) com a Supabase como único backend: Auth,
Postgres com RLS, 6 RPCs `SECURITY DEFINER` e um `pg_cron`. A decisão é sair
dela inteira.

Quatro escolhas foram tomadas explicitamente pelo dono do projeto:

| Questão | Decisão |
|---|---|
| Dados existentes | **Descartados.** São de protótipo. Sem migração, sem exportação, sem preservar link de inquilino já enviado. |
| Stack do backend | **Node + Express + `node:sqlite`.** Uma dependência; banco em arquivo; sem compilação nativa no Windows. |
| Front-end | **Mantido como está.** Vanilla, scripts globais, `onclick` inline. Só a camada de dados troca de destino. |
| Redefinição de senha | **Removida.** Quem enviava o e-mail era a Supabase. |

**Não** foi escolhido: ES Modules, bundler, framework, TypeScript. A linha
"Caminho A" do `docs/ARQUITETURA.md` (vanilla sem build) continua valendo para
o front; este documento a estende para o backend.

### Consequência de deploy, registrada

A Vercel serve estático e funções sem estado. Um processo com banco em arquivo
não roda lá. **Enquanto o deploy não for decidido, o sistema roda local**
(`npm start`). O `vercel.json` sai do repositório junto com o resto — recolocá-lo
seria manter uma configuração que não descreve mais como o sistema roda.

Quando o deploy voltar à pauta, os candidatos são host com disco persistente
(Fly.io, Railway, VPS). Isso é assunto de outro spec.

---

## 2. O que sai do repositório

- `supabase_admin.sql`, `supabase_erp_schema.sql`, `supabase_finalize.sql`,
  `supabase_rls.sql`, `supabase_schema.sql`, `supabase_seguranca.sql` (raiz)
- `supabase/` inteira — `README.md`, `verificacao.sql` e as 4 migrations
- `js/supabase-config.js`
- O `<script>` do CDN jsDelivr e o `connect-src` da Supabase na CSP
- `vercel.json`
- `app.html` (a ponte de redirecionamento — não há mais link antigo a preservar)

`redesign-organic.dc.html` é **renomeado para `app.html`**. O nome atual é
resíduo do export de maquete; sem link em circulação, não há motivo para
carregá-lo.

---

## 3. Estrutura

```
server/
  index.js          Express, monta as rotas, serve public/
  db.js             node:sqlite: abre, cria o schema, expõe consultas
  sessao.js         scrypt + cookie de sessão + middleware `exigirLogin`
  rotas/
    auth.js         registrar, entrar, sair, sessao, senha
    recursos.js     as 6 tabelas do app, com escopo por usuário
    links.js        link do inquilino (público, sem sessão)
    admin.js        leitura para a tela de administração
public/
  app.html  index.html  termos.html
  css/  js/  data/  fonts/
docs/
package.json
data.db             (gitignored)
```

O front inteiro passa a viver em `public/`, servido por
`express.static`. Nenhum arquivo dentro de `public/js/` ou `public/css/` muda
de caminho relativo entre si, então nenhum `<link>` ou `<script>` precisa ser
reescrito por causa da mudança de pasta.

---

## 4. Banco

`node:sqlite`, arquivo `data.db`, schema criado no boot se não existir
(`create table if not exists`). Nove tabelas:

| Tabela | Papel |
|---|---|
| `users` | `id` (uuid), `email` único, `senha_hash`, `salt`, `is_admin`, `criado_em` |
| `sessions` | `token` (PK), `user_id`, `expira_em` |
| `contracts` | mesmas colunas de hoje: `id`, `user_id`, `name`, `template_id`, `fields`, `is_finalized`, `cloud_id`, `cloud_key`, `created_at`, `updated_at` |
| `profiles` | `id` = `users.id`, `profile_data` |
| `properties`, `clients`, `financial_records`, `inspections` | mesmas colunas de hoje |
| `tenant_links` | `id`, `encrypted_payload`, `key_proof`, `finalized`, `finalizado_em`, `finalizado_ip`, `expires_at`, `created_by` |

### A armadilha do JSON — trata no servidor, não no front

`contracts.fields`, `profiles.profile_data` e `inspections.rooms` são `jsonb`
no Postgres, e o PostgREST devolvia **objeto já parseado**. O SQLite guarda
texto e devolve **string**. Se isso passar, `contract.fields.valor_aluguel` vira
`undefined` em todas as telas.

**O `JSON.parse` acontece na resposta do servidor**, não em `storage.js`. Assim
o front continua recebendo exatamente a forma que já recebia — que é a única
maneira de "front intocado" ser verdade. É a mesma classe do bug de dinheiro
100× (numeric serializado como string): o tipo muda na borda, e a borda é onde
se conserta.

Colunas de dinheiro (`numeric` → `real`) não precisam de tratamento:
`Utils.toReais` já aceita número e string.

---

## 5. Autenticação

Substitui `supabaseClient.auth` inteiro.

- **Senha:** `scrypt` do `node:crypto`, salt de 16 bytes por usuário, comparação
  com `timingSafeEqual`. Sem dependência de hashing.
- **Sessão:** token de 32 bytes CSPRNG em cookie `httpOnly`, `SameSite=Strict`,
  `Secure` quando servido por HTTPS. Validade de 30 dias, renovada no uso.
  O cookie é `httpOnly` de propósito: o app tem `unsafe-inline` na CSP e ~85
  handlers inline, então um XSS lê qualquer coisa que o JS alcance — e não pode
  alcançar a sessão.
- **Admin:** coluna `is_admin` em `users`. Antes era claim `role='admin'` em
  `app_metadata`; a decisão registrada de que **o admin não enxerga o ERP**
  continua valendo, e é o `rotas/admin.js` que a garante.

`Auth.logout`, `Auth.login` e as demais assinaturas públicas de `js/auth.js`
não mudam. O fluxo de redefinição de senha (`resetPasswordForEmail` e a tela
que o chama) é removido.

---

## 6. Rotas

### Recursos — `/api/:recurso`

`contracts`, `properties`, `clients`, `financial_records`, `inspections`.
Três verbos:

```
GET    /api/:recurso          lista do usuário da sessão
PUT    /api/:recurso/:id      upsert
DELETE /api/:recurso/:id      remove
```

**`profiles` fica fora dessa família.** Ela não tem coluna `user_id`: a chave
primária *é* o id do usuário, e existe no máximo uma linha por conta. Passá-la
pelo mesmo middleware exigiria uma exceção dentro dele — e exceção dentro da
função que garante o escopo é exatamente onde o furo nasce. Então ela tem duas
rotas próprias, sem `:id` no caminho, porque o único perfil que a sessão pode
tocar é o dela:

```
GET /api/perfil               o perfil da sessão
PUT /api/perfil               grava o perfil da sessão
```

**O invariante que a RLS garantia passa a ser do servidor:** toda consulta de
recurso filtra por `user_id` vindo **da sessão**, nunca de parâmetro do cliente.

Isso é um middleware único que todas as rotas de recurso atravessam — não uma
verificação repetida em cada handler. A repetida é a que alguém esquece de
repetir, e a esquecida é a que vaza a conta do vizinho. O nome do recurso é
validado contra lista branca antes de virar SQL.

### Link do inquilino — `/api/links`

Público (sem sessão) por definição: o inquilino não tem conta. Substitui as 4
RPCs. As invariantes de segurança da Supabase são reimplementadas, não
descartadas:

| Rota | Substitui | Invariantes que carrega |
|---|---|---|
| `POST /api/links` | `create_tenant_link` | exige sessão; teto de 512 KB no payload; 100 links/dia por usuário |
| `PUT /api/links/:id` | `set_tenant_link` | exige `key_proof`; recusa link finalizado ou expirado; `finalize` é caminho só de ida; responde de forma que `CloudDB.updateContract` distinga "não gravou" de "erro de transporte" |
| `GET /api/links/:id` | `get_tenant_link` | apaga expirados na leitura; devolve finalizado de propósito (reabertura/importação) |
| `GET /api/links/:id/evidencia` | `get_tenant_link_evidencia` | `finalizado_em` e `finalizado_ip` carimbados **pelo servidor** |

Duas propriedades preservadas literalmente:

1. **O servidor nunca vê o conteúdo.** O payload chega cifrado em AES-GCM feito
   no navegador; a chave viaja só no fragmento da URL e nunca chega ao servidor.
   O backend guarda bytes opacos, como a Supabase guardava.
2. **A evidência fica fora do payload cifrado.** É a única parte da trilha de
   aceite que quem assina não redige. Carimbada no `PUT` que finaliza.

O `key_proof` continua sendo o que separa "tem o link" de "tem só o id": sem
ele, quem descobrisse o id sobrescrevia e finalizava o contrato de fora.

O expurgo diário do `pg_cron` (03:15) vira **apagar na leitura**: o `GET` remove
os expirados antes de responder. Um agendador para varrer uma tabela que já é
lida a cada acesso é infraestrutura para nada.

### Admin — `/api/admin/*`

`GET /api/admin/users` e `GET /api/admin/contracts`, ambos atrás de
`is_admin`. **Nunca devolvem `cloud_key`** — a mesma regra da migration 002.

---

## 7. Front-end: o que muda

**Não muda:** `dashboard.js`, `contracts.js`, `editor.js`, `tenant-v2.js`,
`properties.js`, `clients.js`, `templates.js`, `financeiro.js`,
`renovacoes.js`, `vistorias.js`, `utils.js`, `data/contracts.js` e todo o CSS.
Zero linhas.

**Muda por dentro, com as assinaturas públicas idênticas:**

| Arquivo | Chamadas |
|---|---|
| `storage.js` | 31 |
| `database.js` | 7 |
| `auth.js` | 6 (mais a remoção do fluxo de senha) |
| `admin.js` | 3 |
| `superadmin.js` | 3 |
| `app.js` | 2 |

Entra `js/api.js`, com os verbos que o app usa de fato:

```js
Api.list('contracts')          // GET    /api/contracts
Api.save('properties', item)   // PUT    /api/properties/:id
Api.remove('clients', id)      // DELETE /api/clients/:id
Api.post('links', {...})       // rotas que não são CRUD
```

**Não haverá um `supabaseClient` falso.** Um shim que imitasse
`.from().select().eq()` daria o menor diff possível e seria a pior escolha:
quem ler o código em três meses vai procurar uma Supabase que não existe mais.
O nome tem que dizer a verdade sobre para onde a chamada vai.

A escrita continua otimista e sem `await` (`Storage._cloudWrite`), e falha
continua virando toast. Esse comportamento não está em discussão aqui.

---

## 8. O que se perde

**Redefinição de senha por e-mail.** Única perda de funcionalidade. A tela sai;
um botão que não chega a e-mail nenhum é pior que botão nenhum. Volta quando
houver serviço de envio escolhido.

**Efeito colateral:** `Storage.inspectionsDisponivel` existia porque a migration
004 podia não ter sido aplicada. Com schema criado no boot, a tabela sempre
existe e a bandeira fica sempre verdadeira. Fica como está — é código morto
inofensivo, e removê-lo tocaria `vistorias.js`, que este spec promete não tocar.

---

## 9. Testes

Os 9 testes atuais continuam passando sem alteração: são de lógica pura
(`Utils`, `Dashboard`, `Financeiro`, busca, tokens, segurança) e não tocam rede.

Entram testes de backend, no mesmo estilo — `node:test`, sem framework:

1. **Escopo por usuário** — usuário A não lê nem apaga registro de B, nas 5
   tabelas de recurso, e não alcança o perfil de B. É o teste que substitui a RLS.
2. **Registro de rota** — falha se uma rota de recurso for montada fora do
   middleware de escopo. A garantia estrutural, não caso a caso.
3. **Senha** — hash não é reversível, salt difere entre usuários, senha errada
   é recusada.
4. **Sessão** — cookie inválido/expirado não autentica; cookie é `httpOnly`.
5. **Ciclo do link** — criar, ler, gravar com `key_proof` certo, recusar com o
   errado, finalizar, recusar segunda escrita depois de finalizado, recusar
   expirado, teto de 512 KB.
6. **Forma da resposta** — `fields` volta como objeto, não string. O teste que
   pega a armadilha da seção 4.
7. **Admin** — `cloud_key` não aparece na resposta; não-admin recebe 403.

---

## 10. Fora de escopo

- Deploy e hospedagem (seção 1)
- Envio de e-mail
- Fotos de vistoria e capa de imóvel (precisa de armazenamento de arquivo)
- ES Modules, bundler, framework, TypeScript
- Reorganizar `utils.js` (966 linhas, seis módulos em um) ou `editor.js`
- Qualquer alteração de comportamento visível nas telas

---

## 11. Ordem de execução

1. Backend em pé isolado: `db.js`, `sessao.js`, `index.js` servindo `public/`.
2. Rotas de auth + testes de senha/sessão.
3. Rotas de recurso + middleware de escopo + testes de escopo e de forma.
4. Rotas de link + testes do ciclo.
5. Rotas de admin + teste.
6. Mover o front para `public/`, renomear o `.dc.html`, apagar o que a seção 2 lista.
7. Trocar o miolo de `storage.js`, `database.js`, `auth.js`, `admin.js`,
   `superadmin.js`, `app.js` por `Api.*`.
8. Rodar o app inteiro e disparar os handlers, como na auditoria de 24/08.
9. `CHANGELOG.md` e `docs/ARQUITETURA.md` — a Parte I inteira descreve a
   Supabase e passa a ser ficção no momento em que isto entrar.
