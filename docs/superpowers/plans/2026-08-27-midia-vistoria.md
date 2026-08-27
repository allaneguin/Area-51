# Fotos e vídeos por ambiente na vistoria — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada ambiente de uma vistoria passa a guardar fotos e vídeos curtos, capturados pela câmera na própria página, e a tela de detalhe é reorganizada em volta disso.

**Architecture:** Tabela `midias` e rotas próprias (`/api/midias`), fora do CRUD genérico — o corpo do pedido nunca decide nome de arquivo no disco. Bytes vão para `uploads/` por upload de corpo cru (`express.raw`), sem multipart e sem dependência nova; a leitura é autenticada e passa por `res.sendFile`, nunca por pasta estática. No front, um módulo novo (`midias.js`) cuida de captura, upload e exclusão, e `vistorias.js` só consome.

**Tech Stack:** Node 24 + Express 5 + `node:sqlite` (sem dependência nova). Front vanilla, scripts globais, `onclick` inline. Testes: `node:test` no backend, arquivos standalone com `new Function` no front.

**Spec:** `docs/superpowers/specs/2026-08-27-midia-vistoria-design.md`

## Global Constraints

- **Nenhuma dependência nova.** `package.json` tem uma só (`express`) e continua assim.
- **Tetos:** foto 8 MB, vídeo 25 MB; 8 fotos e 2 vídeos por ambiente; vídeo cortado em 30 s na gravação.
- **Mimes aceitos:** `image/jpeg`, `image/png`, `image/webp` (foto); `video/webm`, `video/mp4`, `video/quicktime` (vídeo).
- **`midias` NÃO entra no mapa `RECURSOS`** de `server/db.js`.
- **Todo SQL de mídia leva `user_id` da sessão.** Handler nenhum lê usuário do corpo ou da query.
- **Textos de interface em português**, com a voz do resto do sistema (frase curta, sem jargão).
- **Comentário explica *por quê*, não *o quê*** — é o padrão de todo arquivo deste repositório.
- **`npm test` tem que passar inteiro ao fim de cada task.**

---

### Task 1: Tabela `midias` e a pasta de uploads

**Files:**
- Modify: `server/db.js` (schema no boot + export de `PASTA_UPLOADS`)
- Test: `server/servidor.test.js`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `require('./db')` passa a exportar `PASTA_UPLOADS` (string, caminho absoluto da pasta, já criada). Tabela `midias` com as colunas `id, user_id, inspection_id, ambiente, tipo, mime, bytes, arquivo, created_at`.

- [ ] **Step 1: Escrever o teste que falha**

Em `server/servidor.test.js`, logo depois do bloco de testes de link (antes do primeiro `test('nao-admin recebe 403...')`):

```js
// ── Mídia da vistoria ───────────────────────────────────────────────────

test('apagar a vistoria leva as midias junto (cascata)', async () => {
  const { db, PASTA_UPLOADS } = require('./db');
  assert.ok(fs.existsSync(PASTA_UPLOADS), 'a pasta de uploads nasce com o servidor');

  await A('PUT', '/api/inspections/v-cascata', { id: 'v-cascata', tipo: 'Entrada', rooms: [] });
  const dono = (await A('GET', '/api/auth/sessao')).dados.user.id;
  db.prepare(`insert into midias (id, user_id, inspection_id, ambiente, tipo, mime, bytes, arquivo, created_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('m-cascata', dono, 'v-cascata', 0, 'foto', 'image/jpeg', 10, 'm-cascata.jpg', new Date().toISOString());

  assert.strictEqual(db.prepare('select count(*) n from midias').get().n, 1);
  assert.strictEqual((await A('DELETE', '/api/inspections/v-cascata')).status, 200);
  assert.strictEqual(db.prepare('select count(*) n from midias').get().n, 0,
    'a linha de midia nao pode sobreviver a vistoria que ela documenta');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --no-warnings=ExperimentalWarning --test server/servidor.test.js`
Expected: FAIL — `no such table: midias` (a tabela ainda não existe).

- [ ] **Step 3: Criar a tabela e a pasta**

Em `server/db.js`, adicionar `const fs = require('node:fs');` ao topo. Dentro do `db.exec(\`...\`)` do schema, depois do bloco de `tenant_links`:

```sql
create table if not exists midias (
  id            text primary key,
  user_id       text not null references users(id) on delete cascade,
  inspection_id text not null references inspections(id) on delete cascade,
  ambiente      integer not null,
  tipo          text not null,
  mime          text not null,
  bytes         integer not null,
  arquivo       text not null,
  created_at    text not null
);
create index if not exists midias_vistoria_idx on midias (inspection_id, ambiente);
```

Depois do `db.exec` do schema, antes do mapa `RECURSOS`:

```js
// ── Pasta dos arquivos de mídia ─────────────────────────────────────────
//
// Os bytes ficam em disco, não no banco: decisão do dono do projeto. O preço
// dela é que o backup passa a ser DUAS coisas (data.db + uploads/) e que a
// cascata do SQLite apaga a linha sem apagar o arquivo — quem recolhe o órfão é
// a varredura em rotas/midias.js.
//
// `midias` de propósito NÃO entra no mapa RECURSOS abaixo: o CRUD genérico
// grava o que o corpo mandar nas colunas declaradas, e `arquivo` é o nome de um
// arquivo no disco. Nome de arquivo é decisão do servidor, nunca do pedido.
const PASTA_UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
```

E no `module.exports`, acrescentar `PASTA_UPLOADS`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: todos passam, incluindo o novo.

- [ ] **Step 5: Isolar a pasta nos testes**

No topo de `server/servidor.test.js`, junto do `process.env.DB_FILE`:

```js
const UPLOADS = path.join(os.tmpdir(), `mi-test-uploads-${process.pid}`);
process.env.UPLOADS_DIR = UPLOADS;
```

E no `test.after`, junto da limpeza do banco:

```js
try { fs.rmSync(UPLOADS, { recursive: true, force: true }); } catch {}
```

Run: `npm test` — verificar que a pasta `uploads/` da raiz do projeto **não** foi criada pelos testes (`ls uploads` só existe depois de rodar `npm start`).

- [ ] **Step 6: Commit**

```bash
git add server/db.js server/servidor.test.js
git commit -m "feat(midias): tabela de midia da vistoria e pasta de uploads"
```

---

### Task 2: Upload — `POST /api/midias`

**Files:**
- Create: `server/rotas/midias.js`
- Modify: `server/index.js` (montar a rota antes do CRUD genérico)
- Test: `server/servidor.test.js`

**Interfaces:**
- Consumes: `PASTA_UPLOADS` e `db` de `../db`; `exigirLogin` de `../sessao`.
- Produces: `POST /api/midias?vistoria=<id>&ambiente=<n>&tipo=foto|video`, corpo cru com `Content-Type` do arquivo. Responde `201` com `{ id, ambiente, tipo, mime, bytes, created_at }`. Erros: `400` (parâmetro inválido), `404` (vistoria não é da sessão ou não existe), `409` (estourou a quantidade), `413` (acima do teto), `415` (mime fora da lista). O módulo exporta o router e, para as próximas tasks, `TIPOS` e `varrer` via `module.exports = router; module.exports.TIPOS = TIPOS; module.exports.varrer = varrer;`.

- [ ] **Step 1: Escrever os testes que falham**

Em `server/servidor.test.js`, depois do teste da Task 1. `enviar` é um helper local — `cliente()` só fala JSON, e aqui o corpo é binário:

```js
// Corpo cru, não multipart: o teste fala com a rota do mesmo jeito que o
// navegador (fetch com o Blob no body).
async function enviar(cookieDe, qs, mime, bytes) {
  const r = await fetch(base + '/api/midias?' + qs, {
    method: 'POST',
    headers: { 'Content-Type': mime, Cookie: cookieDe },
    body: bytes
  });
  let dados = null;
  try { dados = JSON.parse(await r.text()); } catch {}
  return { status: r.status, dados };
}

// Cookie de cada conta, para o helper acima.
let cookieA = '', cookieB = '';
test('captura os cookies das duas contas para os testes de midia', async () => {
  const rA = await fetch(base + '/api/auth/entrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@teste.com', senha: 'segredo123' })
  });
  cookieA = rA.headers.getSetCookie()[0].split(';')[0];
  const rB = await fetch(base + '/api/auth/entrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'b@teste.com', senha: 'segredo123' })
  });
  cookieB = rB.headers.getSetCookie()[0].split(';')[0];
  assert.ok(cookieA && cookieB);
});

test('sobe uma foto para o ambiente da vistoria', async () => {
  await A('PUT', '/api/inspections/v1', { id: 'v1', tipo: 'Entrada', rooms: [{ nome: 'Sala', estado: 'Bom' }] });
  const r = await enviar(cookieA, 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', Buffer.from('fingindo-ser-jpeg'));
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.tipo, 'foto');
  assert.strictEqual(r.dados.ambiente, 0);
  assert.strictEqual(r.dados.bytes, 17);
});

test('midia exige sessao', async () => {
  const r = await enviar('', 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', Buffer.from('x'));
  assert.strictEqual(r.status, 401);
});

test('B nao sobe midia para vistoria de A, mesmo sabendo o id', async () => {
  const r = await enviar(cookieB, 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', Buffer.from('x'));
  // 404, nao 403: dizer "existe, mas nao e sua" ja conta que aquele id existe.
  assert.strictEqual(r.status, 404);
});

test('formato fora da lista branca e recusado', async () => {
  const r = await enviar(cookieA, 'vistoria=v1&ambiente=0&tipo=foto', 'application/pdf', Buffer.from('%PDF-'));
  assert.ok(r.status === 415 || r.status === 400, 'PDF nao e foto: ' + r.status);
});

test('video mandado como foto e recusado', async () => {
  const r = await enviar(cookieA, 'vistoria=v1&ambiente=0&tipo=foto', 'video/webm', Buffer.from('x'));
  assert.strictEqual(r.status, 415, 'o tipo declarado e o mime tem que combinar');
});

test('acima do teto da foto e recusado', async () => {
  const grande = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
  const r = await enviar(cookieA, 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', grande);
  assert.strictEqual(r.status, 413);
});

test('estourar a quantidade por ambiente e recusado', async () => {
  await A('PUT', '/api/inspections/v-cheio', { id: 'v-cheio', tipo: 'Entrada', rooms: [{ nome: 'Sala' }] });
  for (let i = 0; i < 2; i++) {
    const ok = await enviar(cookieA, 'vistoria=v-cheio&ambiente=0&tipo=video', 'video/webm', Buffer.from('v' + i));
    assert.strictEqual(ok.status, 201, 'os dois primeiros videos entram');
  }
  const terceiro = await enviar(cookieA, 'vistoria=v-cheio&ambiente=0&tipo=video', 'video/webm', Buffer.from('v3'));
  assert.strictEqual(terceiro.status, 409, 'o terceiro video no mesmo ambiente nao entra');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --no-warnings=ExperimentalWarning --test server/servidor.test.js`
Expected: FAIL — a rota responde 404 (`Rota inexistente.`), então `sobe uma foto` falha com `404 !== 201`.

- [ ] **Step 3: Escrever a rota**

Criar `server/rotas/midias.js`:

```js
// ═══════════════════════════════════════════════════════
// Mídia da vistoria — fotos e vídeos por ambiente.
//
// Fora do CRUD genérico de propósito. Lá o corpo do pedido decide o conteúdo
// das colunas declaradas, e uma delas é `arquivo`: o nome de um arquivo real no
// disco. Cliente que escolhe nome de arquivo lê o arquivo de qualquer um.
//
// O upload é de corpo CRU, não multipart: o navegador manda o Blob direto
// (`fetch(url, { method: 'POST', body: blob })`) e o Content-Type dele diz o que
// é. Multipart exigiria uma dependência para resolver o que uma linha resolve.
// ═══════════════════════════════════════════════════════

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, PASTA_UPLOADS } = require('../db');
const { exigirLogin } = require('../sessao');

const router = express.Router();

// Primeira linha do arquivo que roda: nada abaixo é alcançável sem sessão.
router.use(exigirLogin);

// Teto e quantidade por tipo. Sem quantidade máxima, um ambiente engole o disco
// e ninguém percebe até acabar.
const TIPOS = {
  foto: {
    mimes: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
    teto: 8 * 1024 * 1024,
    max: 8
  },
  video: {
    mimes: { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov' },
    teto: 25 * 1024 * 1024,
    max: 2
  }
};

const TODOS_OS_MIMES = Object.values(TIPOS).flatMap(t => Object.keys(t.mimes));

// O teto do middleware é o do MAIOR tipo; o teto por tipo é conferido no
// handler. Corpo acima disto o Express recusa antes de alocar memória.
const corpoCru = express.raw({ type: TODOS_OS_MIMES, limit: '25mb' });

// Arquivo sem linha é lixo: acontece se o processo morrer entre gravar o
// arquivo e inserir a linha, e é o que sobra quando a cascata do SQLite apaga
// as linhas de uma vistoria excluída. Quem recolhe é a própria leitura — o
// mesmo desenho do `expurgar()` dos links, que dispensou o agendador.
function varrer() {
  let nomes;
  try { nomes = fs.readdirSync(PASTA_UPLOADS); } catch { return; }
  if (!nomes.length) return;
  const vivos = new Set(db.prepare('select arquivo from midias').all().map(l => l.arquivo));
  for (const nome of nomes) {
    if (vivos.has(nome)) continue;
    try { fs.unlinkSync(path.join(PASTA_UPLOADS, nome)); } catch { /* já sumiu */ }
  }
}

// A vistoria é da sessão? Vale para todas as rotas que recebem `vistoria`.
function vistoriaDaSessao(id, usuarioId) {
  const linha = db.prepare('select user_id from inspections where id = ?').get(id);
  return !!(linha && linha.user_id === usuarioId);
}

// ── Subir ───────────────────────────────────────────────────────────────
router.post('/', corpoCru, (req, res) => {
  varrer();

  const meta = TIPOS[req.query.tipo];
  if (!meta) return res.status(400).json({ erro: 'Tipo de mídia inválido.' });

  const ambiente = Number(req.query.ambiente);
  if (!Number.isInteger(ambiente) || ambiente < 0) {
    return res.status(400).json({ erro: 'Ambiente inválido.' });
  }

  const vistoria = String(req.query.vistoria || '');
  if (!vistoriaDaSessao(vistoria, req.usuario.id)) {
    return res.status(404).json({ erro: 'Vistoria não encontrada.' });
  }

  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = meta.mimes[mime];
  if (!ext) return res.status(415).json({ erro: 'Formato de arquivo não aceito.' });

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ erro: 'Arquivo vazio.' });
  }
  if (req.body.length > meta.teto) {
    return res.status(413).json({ erro: 'Arquivo acima do limite.' });
  }

  const { n } = db.prepare(
    'select count(*) n from midias where inspection_id = ? and ambiente = ? and tipo = ?'
  ).get(vistoria, ambiente, req.query.tipo);
  if (n >= meta.max) {
    return res.status(409).json({ erro: `Limite de ${meta.max} por ambiente atingido.` });
  }

  // Arquivo primeiro, linha depois: linha sem arquivo é cartão quebrado na
  // tela; arquivo sem linha é lixo, e lixo a varredura recolhe.
  const id = crypto.randomUUID();
  const arquivo = `${id}.${ext}`;
  const criado = new Date().toISOString();
  fs.writeFileSync(path.join(PASTA_UPLOADS, arquivo), req.body);

  db.prepare(`
    insert into midias (id, user_id, inspection_id, ambiente, tipo, mime, bytes, arquivo, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.usuario.id, vistoria, ambiente, req.query.tipo, mime, req.body.length, arquivo, criado);

  res.status(201).json({
    id, ambiente, tipo: req.query.tipo, mime, bytes: req.body.length, created_at: criado
  });
});

module.exports = router;
module.exports.TIPOS = TIPOS;
module.exports.varrer = varrer;
```

- [ ] **Step 4: Montar a rota**

Em `server/index.js`, junto das outras rotas de API e **antes** de `app.use('/api', require('./rotas/recursos'))` — o CRUD genérico casa qualquer `/api/<coisa>` e responderia 404 de recurso desconhecido:

```js
app.use('/api/midias', require('./rotas/midias'));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: todos passam. Se `formato fora da lista branca` vier com 400 em vez de 415, é o `express.raw` recusando o mime antes do handler — o teste aceita os dois de propósito.

- [ ] **Step 6: Commit**

```bash
git add server/rotas/midias.js server/index.js server/servidor.test.js
git commit -m "feat(midias): upload de foto e video por ambiente, com teto e lista branca"
```

---

### Task 3: Listar, ler e apagar mídia

**Files:**
- Modify: `server/rotas/midias.js`
- Test: `server/servidor.test.js`

**Interfaces:**
- Consumes: `TIPOS`, `varrer`, `vistoriaDaSessao` do próprio módulo.
- Produces: `GET /api/midias?vistoria=<id>` → `[{ id, ambiente, tipo, mime, bytes, created_at }]`. `GET /api/midias/:id/arquivo` → os bytes com o mime original. `DELETE /api/midias/:id` → `{ ok: true }`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('lista as midias da vistoria, e so as da conta', async () => {
  const r = await A('GET', '/api/midias?vistoria=v1');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.dados.length, 1, 'a foto da task anterior esta la');
  assert.strictEqual(r.dados[0].tipo, 'foto');
  assert.strictEqual(r.dados[0].bytes, 17);

  const deB = await B('GET', '/api/midias?vistoria=v1');
  assert.deepStrictEqual(deB.dados, [], 'B nao enxerga a midia da vistoria de A');
});

test('o arquivo volta com os bytes e o mime que subiram', async () => {
  const id = (await A('GET', '/api/midias?vistoria=v1')).dados[0].id;
  const r = await fetch(base + '/api/midias/' + id + '/arquivo', { headers: { Cookie: cookieA } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('content-type').split(';')[0], 'image/jpeg');
  assert.strictEqual(await r.text(), 'fingindo-ser-jpeg');

  const semSessao = await fetch(base + '/api/midias/' + id + '/arquivo');
  assert.strictEqual(semSessao.status, 401, 'arquivo de midia nao e publico');

  const deB = await fetch(base + '/api/midias/' + id + '/arquivo', { headers: { Cookie: cookieB } });
  assert.strictEqual(deB.status, 404, 'nem para outra conta que saiba o id');
});

test('apagar a midia leva o arquivo do disco junto', async () => {
  const { db, PASTA_UPLOADS } = require('./db');
  const id = (await A('GET', '/api/midias?vistoria=v1')).dados[0].id;
  const arquivo = db.prepare('select arquivo from midias where id = ?').get(id).arquivo;
  assert.ok(fs.existsSync(path.join(PASTA_UPLOADS, arquivo)));

  assert.strictEqual((await B('DELETE', '/api/midias/' + id)).status, 404, 'B nao apaga midia de A');
  assert.strictEqual((await A('DELETE', '/api/midias/' + id)).status, 200);

  assert.strictEqual(fs.existsSync(path.join(PASTA_UPLOADS, arquivo)), false,
    'linha apagada sem arquivo apagado e lixo que ninguem mais alcanca');
});

test('a varredura recolhe arquivo orfao', async () => {
  const { PASTA_UPLOADS } = require('./db');
  const orfao = path.join(PASTA_UPLOADS, 'orfao-de-teste.jpg');
  fs.writeFileSync(orfao, 'sem linha no banco');
  assert.ok(fs.existsSync(orfao));

  await A('GET', '/api/midias?vistoria=v1');   // a leitura varre

  assert.strictEqual(fs.existsSync(orfao), false,
    'e assim que o arquivo da vistoria apagada some — a cascata do SQLite nao alcanca o disco');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --no-warnings=ExperimentalWarning --test server/servidor.test.js`
Expected: FAIL — `lista as midias` recebe 404 (a rota GET não existe).

- [ ] **Step 3: Implementar as três rotas**

Em `server/rotas/midias.js`, antes do `module.exports`:

```js
// ── Listar ──────────────────────────────────────────────────────────────
// Sem os bytes: a tela precisa saber o que existe, não carregar tudo.
router.get('/', (req, res) => {
  varrer();
  const linhas = db.prepare(`
    select id, ambiente, tipo, mime, bytes, created_at
      from midias
     where inspection_id = ? and user_id = ?
     order by ambiente, created_at
  `).all(String(req.query.vistoria || ''), req.usuario.id);
  res.json(linhas);
});

// ── O arquivo ───────────────────────────────────────────────────────────
// NUNCA uma pasta estática: foto do imóvel de um cliente com nome adivinhável
// vaza por URL, sem sessão nenhuma. `sendFile` também trata `Range` sozinho, e
// é com Range que o <video> busca no meio sem baixar os 25 MB.
router.get('/:id/arquivo', (req, res) => {
  const m = db.prepare('select arquivo, mime from midias where id = ? and user_id = ?')
    .get(req.params.id, req.usuario.id);
  if (!m) return res.status(404).json({ erro: 'Mídia não encontrada.' });

  res.setHeader('Content-Type', m.mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.join(PASTA_UPLOADS, m.arquivo), (err) => {
    if (err && !res.headersSent) res.status(404).json({ erro: 'Arquivo indisponível.' });
  });
});

// ── Apagar ──────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const m = db.prepare('select arquivo from midias where id = ? and user_id = ?')
    .get(req.params.id, req.usuario.id);
  // 404 tanto para "não existe" quanto para "é de outro": distinguir os dois
  // contaria ao chamador que aquele id existe em alguma conta.
  if (!m) return res.status(404).json({ erro: 'Mídia não encontrada.' });

  db.prepare('delete from midias where id = ? and user_id = ?').run(req.params.id, req.usuario.id);
  try { fs.unlinkSync(path.join(PASTA_UPLOADS, m.arquivo)); } catch { /* já sumiu */ }
  res.json({ ok: true });
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add server/rotas/midias.js server/servidor.test.js
git commit -m "feat(midias): listagem, leitura autenticada e exclusao com varredura de orfao"
```

---

### Task 4: Reindexar ao remover um ambiente

**Files:**
- Modify: `server/rotas/midias.js`
- Test: `server/servidor.test.js`

**Interfaces:**
- Consumes: `vistoriaDaSessao`.
- Produces: `POST /api/midias/reindexar` com corpo JSON `{ vistoria, removido }` → `{ ok: true }`. Apaga as mídias do ambiente removido e desloca em −1 o `ambiente` de todas as posteriores.

**Desvio do spec, registrado:** o spec (§6) previa o teste da reindexação em
`vistorias.test.js`. A lógica ficou no servidor — são dois comandos SQL numa
transação de requisição, e fazer o deslocamento no cliente seria uma sequência de
pedidos que uma recarga no meio deixa pela metade. O teste acompanhou a lógica e
está em `servidor.test.js`; o que se testa é o mesmo.

**Por que existe:** `ambiente` é índice posicional dentro de `inspections.rooms`. Remover a Sala (índice 0) faz a Cozinha virar 0 — e, sem isto, as fotos da Sala apagada aparecem na Cozinha. Fazer o deslocamento no cliente seria uma sequência de pedidos que uma recarga no meio deixa pela metade; aqui são dois `UPDATE`/`DELETE` na mesma requisição.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('remover um ambiente do meio reindexa as midias dos seguintes', async () => {
  await A('PUT', '/api/inspections/v-reidx', {
    id: 'v-reidx', tipo: 'Entrada',
    rooms: [{ nome: 'Sala' }, { nome: 'Cozinha' }, { nome: 'Quarto' }]
  });
  await enviar(cookieA, 'vistoria=v-reidx&ambiente=0&tipo=foto', 'image/jpeg', Buffer.from('da-sala'));
  await enviar(cookieA, 'vistoria=v-reidx&ambiente=1&tipo=foto', 'image/jpeg', Buffer.from('da-cozinha'));
  await enviar(cookieA, 'vistoria=v-reidx&ambiente=2&tipo=foto', 'image/jpeg', Buffer.from('do-quarto'));

  const r = await A('POST', '/api/midias/reindexar', { vistoria: 'v-reidx', removido: 0 });
  assert.strictEqual(r.status, 200);

  const lista = (await A('GET', '/api/midias?vistoria=v-reidx')).dados;
  assert.strictEqual(lista.length, 2, 'a foto do ambiente removido foi junto');
  assert.deepStrictEqual(lista.map(m => m.ambiente), [0, 1],
    'cozinha e quarto andaram uma casa para tras — senao a foto da cozinha aparece na sala');

  const deB = await B('POST', '/api/midias/reindexar', { vistoria: 'v-reidx', removido: 0 });
  assert.strictEqual(deB.status, 404, 'B nao reindexa vistoria de A');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --no-warnings=ExperimentalWarning --test server/servidor.test.js`
Expected: FAIL — `200 !== 404`, a rota não existe.

- [ ] **Step 3: Implementar**

Em `server/rotas/midias.js`, depois da rota de listar:

```js
// ── Reindexar depois de remover um ambiente ─────────────────────────────
// `ambiente` é índice posicional dentro de inspections.rooms: tirar a Sala faz
// a Cozinha virar 0. Sem este passo, a foto da Sala apagada reaparece na
// Cozinha — e a vistoria passa a documentar o cômodo errado.
router.post('/reindexar', express.json(), (req, res) => {
  const { vistoria, removido } = req.body || {};
  const i = Number(removido);
  if (!Number.isInteger(i) || i < 0) return res.status(400).json({ erro: 'Ambiente inválido.' });
  if (!vistoriaDaSessao(String(vistoria || ''), req.usuario.id)) {
    return res.status(404).json({ erro: 'Vistoria não encontrada.' });
  }

  const doRemovido = db.prepare(
    'select arquivo from midias where inspection_id = ? and user_id = ? and ambiente = ?'
  ).all(vistoria, req.usuario.id, i);

  db.prepare('delete from midias where inspection_id = ? and user_id = ? and ambiente = ?')
    .run(vistoria, req.usuario.id, i);
  db.prepare('update midias set ambiente = ambiente - 1 where inspection_id = ? and user_id = ? and ambiente > ?')
    .run(vistoria, req.usuario.id, i);

  for (const m of doRemovido) {
    try { fs.unlinkSync(path.join(PASTA_UPLOADS, m.arquivo)); } catch { /* já sumiu */ }
  }
  res.json({ ok: true });
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add server/rotas/midias.js server/servidor.test.js
git commit -m "feat(midias): reindexar ambientes ao remover um do meio da vistoria"
```

---

### Task 5: Cliente HTTP e regras de mídia no front

**Files:**
- Modify: `public/js/api.js` (três métodos novos)
- Create: `public/js/midias.js`
- Create: `public/js/midias.test.js`
- Modify: `package.json` (script de teste)
- Modify: `public/app.html` (CSP + `<script>` do módulo novo)

**Interfaces:**
- Consumes: as rotas das tasks 2–4.
- Produces:
  - `Api.listarMidias(vistoriaId) -> Promise<Array>`
  - `Api.enviarMidia(vistoriaId, ambiente, tipo, blob) -> Promise<{id,...}>`
  - `Api.removerMidia(id) -> Promise<{ok:true}>`
  - `Api.reindexarMidias(vistoriaId, removido) -> Promise<{ok:true}>`
  - `Midias.LIMITES` — `{ foto: {teto, max, mimes[]}, video: {teto, max, mimes[], segundos} }`
  - `Midias.validar(tipo, blob, quantidadeAtual) -> string|null` (mensagem em português ou `null` quando pode subir)
  - `Midias.reduzir(largura, altura, maximo) -> {largura, altura}`

- [ ] **Step 1: Escrever o teste que falha**

Criar `public/js/midias.test.js`:

```js
// Check das regras de midia: o que pode subir e para que tamanho a foto encolhe.
// Rodar: node js/midias.test.js
//
// Por que so estas duas: captura e upload sao DOM e camera, e nao ha seam
// honesto para isso em Node. As REGRAS, sim — e sao elas que decidem se o
// locador ve "limite atingido" ou um erro do servidor depois de esperar o
// upload de 25 MB.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
global.Utils = load('utils.js', 'Utils');
const Midias = load('midias.js', 'Midias');

const blob = (tipo, tamanho) => ({ type: tipo, size: tamanho });

// ── Validação ───────────────────────────────────────────────────────────
assert.strictEqual(Midias.validar('foto', blob('image/jpeg', 500 * 1024), 0), null,
  'foto pequena de tipo aceito passa');
assert.strictEqual(Midias.validar('video', blob('video/webm', 5 * 1024 * 1024), 1), null,
  'segundo video ainda cabe');

assert.match(Midias.validar('foto', blob('application/pdf', 100), 0), /formato/i,
  'PDF nao e foto');
assert.match(Midias.validar('foto', blob('image/jpeg', 9 * 1024 * 1024), 0), /8 MB|limite/i,
  'foto acima do teto e barrada ANTES de subir 9 MB pela rede');
assert.match(Midias.validar('video', blob('video/webm', 26 * 1024 * 1024), 0), /25 MB|limite/i);
assert.match(Midias.validar('foto', blob('image/jpeg', 100), 8), /8/,
  'nono arquivo no mesmo ambiente e barrado');
assert.match(Midias.validar('video', blob('video/webm', 100), 2), /2/);
assert.match(Midias.validar('outro', blob('image/jpeg', 100), 0), /tipo/i);

// ── Redução da foto ─────────────────────────────────────────────────────
// Foto de celular tem 3-5 MB; reduzida para 1600px na maior dimensao cai para a
// casa das centenas de KB, que e o que faz o upload valer num 4G ruim.
assert.deepStrictEqual(Midias.reduzir(4000, 3000, 1600), { largura: 1600, altura: 1200 });
assert.deepStrictEqual(Midias.reduzir(3000, 4000, 1600), { largura: 1200, altura: 1600 });
assert.deepStrictEqual(Midias.reduzir(800, 600, 1600), { largura: 800, altura: 600 },
  'imagem menor que o teto nao e ampliada');

console.log('ok — midias: limites por tipo e reducao da foto antes do upload');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd public && node js/midias.test.js`
Expected: FAIL — `ENOENT: js/midias.js` (o módulo ainda não existe).

- [ ] **Step 3: Escrever `public/js/midias.js`**

```js
// ═══════════════════════════════════════════════════════
// Mídia da vistoria — captura, envio e exclusão.
//
// O que dá para testar mora em cima (validar/reduzir, funções puras); embaixo
// fica a parte que é câmera e DOM, verificada por auditoria de runtime.
//
// A câmera na página é a captura principal, mas NUNCA a única: getUserMedia não
// existe em contexto não-seguro (http:// fora de localhost), a permissão pode
// ser negada e a máquina pode não ter câmera. Sem o seletor de arquivo ao lado,
// a funcionalidade simplesmente não existe nesses casos — é a mesma proteção
// que a selfie do inquilino já carrega.
// ═══════════════════════════════════════════════════════

const Midias = {
  LIMITES: {
    foto: {
      teto: 8 * 1024 * 1024,
      max: 8,
      mimes: ['image/jpeg', 'image/png', 'image/webp'],
      rotulo: '8 MB'
    },
    video: {
      teto: 25 * 1024 * 1024,
      max: 2,
      mimes: ['video/webm', 'video/mp4', 'video/quicktime'],
      rotulo: '25 MB',
      segundos: 30
    }
  },

  // Maior dimensão da foto depois da redução. 1600px imprime bem e cabe na tela
  // de qualquer aparelho; o original de celular tem 3000-4000px e 3-5 MB.
  MAX_PX: 1600,

  // Devolve a mensagem do problema, ou null quando pode subir. Barrar aqui é o
  // que evita o locador esperar o upload inteiro para ouvir "não".
  validar(tipo, arquivo, quantidadeAtual) {
    const lim = this.LIMITES[tipo];
    if (!lim) return 'Tipo de mídia desconhecido.';
    if (!arquivo) return 'Nenhum arquivo selecionado.';
    if (lim.mimes.indexOf(arquivo.type) === -1) {
      return tipo === 'foto'
        ? 'Formato de imagem não aceito. Use JPG, PNG ou WEBP.'
        : 'Formato de vídeo não aceito. Use MP4, WEBM ou MOV.';
    }
    if (arquivo.size > lim.teto) return `Arquivo acima do limite de ${lim.rotulo}.`;
    if (quantidadeAtual >= lim.max) {
      return `Limite de ${lim.max} ${tipo === 'foto' ? 'fotos' : 'vídeos'} por ambiente atingido.`;
    }
    return null;
  },

  // Cabe no quadrado de `maximo`, mantendo a proporção. Nunca amplia.
  reduzir(largura, altura, maximo) {
    const maior = Math.max(largura, altura);
    if (maior <= maximo) return { largura, altura };
    const fator = maximo / maior;
    return { largura: Math.round(largura * fator), altura: Math.round(altura * fator) };
  },

  // ── Daqui para baixo: DOM, câmera e rede ──────────────────────────────

  // Estado da captura em andamento, por ambiente.
  _stream: null,
  _gravador: null,
  _pedacos: [],

  // URL do arquivo servido pelo backend. Nunca é caminho de disco: a leitura
  // passa por sessão.
  url(id) {
    return '/api/midias/' + encodeURIComponent(id) + '/arquivo';
  },

  // Encolhe a foto antes de subir. Recebe um File/Blob, devolve um Blob JPEG.
  async encolherFoto(arquivo) {
    const bitmap = await createImageBitmap(arquivo);
    const { largura, altura } = this.reduzir(bitmap.width, bitmap.height, this.MAX_PX);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  },

  // Sobe e devolve a linha criada. Quem chama só mostra a miniatura DEPOIS
  // disto: a tela nunca exibe mídia que o servidor não confirmou.
  async enviar(vistoriaId, ambiente, tipo, arquivo, quantidadeAtual) {
    const problema = this.validar(tipo, arquivo, quantidadeAtual);
    if (problema) { Utils.toast(problema, 'error'); return null; }

    const bytes = tipo === 'foto' ? await this.encolherFoto(arquivo) : arquivo;
    try {
      return await Api.enviarMidia(vistoriaId, ambiente, tipo, bytes);
    } catch (e) {
      Utils.toast('Não foi possível enviar: ' + (e.message || ''), 'error');
      return null;
    }
  },

  // Abre a câmera num <video> já existente na página. Devolve false quando não
  // dá — e é aí que o seletor de arquivo assume.
  async abrirCamera(elementoVideo, deVideo) {
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: !!deVideo
      });
      elementoVideo.srcObject = this._stream;
      return true;
    } catch (e) {
      console.warn('Câmera indisponível:', e && e.message);
      Utils.toast('Câmera indisponível — use "Escolher arquivo".', 'error');
      return false;
    }
  },

  fecharCamera() {
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    this._stream = null;
  },

  // Um quadro do stream vira Blob JPEG já no tamanho final.
  fotografar(elementoVideo) {
    const { largura, altura } = this.reduzir(
      elementoVideo.videoWidth, elementoVideo.videoHeight, this.MAX_PX);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(elementoVideo, 0, 0, largura, altura);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  },

  // Grava com corte automático: 30s é o bastante para mostrar uma infiltração,
  // e é o que mantém o arquivo abaixo do teto sem depender de boa vontade.
  gravar(aoTerminar) {
    const mime = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
    this._pedacos = [];
    this._gravador = new MediaRecorder(this._stream, { mimeType: mime });
    this._gravador.ondataavailable = e => { if (e.data.size) this._pedacos.push(e.data); };
    this._gravador.onstop = () => aoTerminar(new Blob(this._pedacos, { type: mime }));
    this._gravador.start();
    this._corte = setTimeout(() => this.pararGravacao(), this.LIMITES.video.segundos * 1000);
  },

  pararGravacao() {
    clearTimeout(this._corte);
    if (this._gravador && this._gravador.state !== 'inactive') this._gravador.stop();
    this._gravador = null;
  },

  // Pergunta pública: a tela alterna o mesmo botão entre gravar e parar, e não
  // deve depender de espiar `_gravador` de fora.
  gravando() {
    return !!this._gravador;
  }
};
```

- [ ] **Step 4: Escrever os métodos de rede em `public/js/api.js`**

Depois do bloco `// ── Link do inquilino ──`:

```js
  // ── Mídia da vistoria ─────────────────────────────────────────────────
  // O upload NÃO passa por `_req`: o corpo é o arquivo cru, não JSON, e o
  // Content-Type é o do próprio arquivo — é assim que a rota dispensa multipart.
  listarMidias(vistoriaId) {
    return this._req('GET', 'midias?vistoria=' + encodeURIComponent(vistoriaId));
  },

  removerMidia(id) { return this._req('DELETE', 'midias/' + encodeURIComponent(id)); },

  reindexarMidias(vistoriaId, removido) {
    return this._req('POST', 'midias/reindexar', { vistoria: vistoriaId, removido });
  },

  async enviarMidia(vistoriaId, ambiente, tipo, arquivo) {
    const qs = `vistoria=${encodeURIComponent(vistoriaId)}&ambiente=${ambiente}&tipo=${tipo}`;
    let r;
    try {
      r = await fetch('/api/midias?' + qs, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': arquivo.type },
        body: arquivo
      });
    } catch (e) {
      const erro = new Error('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.');
      erro.transporte = true;
      throw erro;
    }
    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch {}
    if (!r.ok) {
      const erro = new Error((dados && dados.erro) || ('Erro ' + r.status));
      erro.status = r.status;
      throw erro;
    }
    return dados;
  },
```

- [ ] **Step 5: CSP e carga do script em `public/app.html`**

Na `<meta http-equiv="Content-Security-Policy">`, acrescentar a diretiva `media-src` depois de `img-src`:

```
img-src 'self' data: blob:; media-src 'self' blob:;
```

`'self'` é o vídeo já salvo (servido pela nossa rota); `blob:` é o preview da gravação, antes de subir. Sem a diretiva, `default-src 'self'` bloqueia o `blob:` e o preview fica preto.

E carregar o módulo junto dos outros, **antes** de `vistorias.js` (que passa a usá-lo) e depois de `api.js`:

```html
<script src="js/midias.js"></script>
```

- [ ] **Step 6: Ligar o teste na suíte**

Em `package.json`, no fim do script `test`:

```
&& node public/js/midias.test.js
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test`
Expected: tudo passa, incluindo `ok — midias: limites por tipo e reducao da foto antes do upload`.

- [ ] **Step 8: Commit**

```bash
git add public/js/midias.js public/js/midias.test.js public/js/api.js public/app.html package.json
git commit -m "feat(midias): cliente de midia no front, com limites conferidos antes do upload"
```

---

### Task 6: A tela — faixa de mídia por ambiente e cartão reorganizado

**Files:**
- Modify: `public/js/vistorias.js` (detalhe do ambiente, carga da lista, ações)
- Modify: `public/css/dashboard.css` (junto de `.vistoria-layout`, que já mora lá)
- Test: auditoria de runtime (sem seam automatizado — regra do `ARQUITETURA.md` §272)

**Interfaces:**
- Consumes: `Midias.*`, `Api.listarMidias/removerMidia/reindexarMidias`.
- Produces: `Vistorias.midias` (array em memória, recarregado ao abrir a vistoria), `Vistorias.recarregarMidias(id)`, `Vistorias.abrirCaptura(id, ambiente, tipo)`, `Vistorias.excluirMidia(id, midiaId)`.

- [ ] **Step 1: Carregar a lista ao abrir a vistoria**

Em `public/js/vistorias.js`, no objeto, junto de `abertaId`:

```js
  // Mídia da vistoria aberta. Fica no módulo, e NÃO no cache do Storage: lá
  // dentro, `loadCloudData` baixaria a mídia de todas as vistorias a cada
  // login, para uma tela que quase nunca está aberta.
  midias: [],

  // Captura em andamento: { vistoriaId, ambiente, tipo } ou null.
  captura: null,
```

E em `abrir(id)`:

```js
  abrir(id) {
    this.abertaId = id;
    this.midias = [];
    this.render(document.getElementById('main-content'));
    this.recarregarMidias(id);
  },

  async recarregarMidias(id) {
    try {
      this.midias = await Api.listarMidias(id);
    } catch (e) {
      console.warn('Mídia indisponível:', e && e.message);
      Utils.toast('Não foi possível carregar as fotos desta vistoria.', 'error');
      return;
    }
    if (this.abertaId === id) this.render(document.getElementById('main-content'));
  },

  midiasDo(ambiente, tipo) {
    return this.midias.filter(m => m.ambiente === ambiente && (!tipo || m.tipo === tipo));
  },
```

- [ ] **Step 2: Trocar o `select` de estado por três botões e acrescentar a faixa de mídia**

Dentro do `rooms.map((r, i) => ...)` de `renderDetalhe`, substituir o bloco do `<div class="form-group">` do Estado por:

```js
              <div class="estado-botoes" role="group" aria-label="Estado de ${Utils.esc(r.nome || 'ambiente')}">
                ${this.ESTADOS.map(e => `
                  <button type="button" class="estado-botao ${r.estado === e ? 'ativo ' + this.classeEstado(e) : ''}"
                    ${fechada ? 'disabled' : ''} aria-pressed="${r.estado === e}"
                    onclick="Vistorias.setEstado('${Utils.esc(v.id)}', ${i}, '${Utils.esc(e)}')">${Utils.esc(e)}</button>
                `).join('')}
              </div>

              <div class="midia-faixa">
                ${this.midiasDo(i).map(m => `
                  <figure class="midia-item">
                    ${m.tipo === 'foto'
                      ? `<img src="${Utils.esc(Midias.url(m.id))}" alt="Foto de ${Utils.esc(r.nome || 'ambiente')}" loading="lazy">`
                      : `<video src="${Utils.esc(Midias.url(m.id))}" controls preload="metadata"></video>`}
                    ${fechada ? '' : `<button type="button" class="midia-remover" title="Remover"
                      aria-label="Remover mídia de ${Utils.esc(r.nome || 'ambiente')}"
                      onclick="Vistorias.excluirMidia('${Utils.esc(v.id)}', '${Utils.esc(m.id)}')">&times;</button>`}
                  </figure>
                `).join('')}
                ${fechada ? '' : `
                  <button type="button" class="midia-add" onclick="Vistorias.abrirCaptura('${Utils.esc(v.id)}', ${i}, 'foto')">+ Foto</button>
                  <button type="button" class="midia-add" onclick="Vistorias.abrirCaptura('${Utils.esc(v.id)}', ${i}, 'video')">+ Vídeo</button>
                `}
              </div>
```

E no `textarea` das observações, trocar `rows="3"` por `rows="2"`.

- [ ] **Step 3: Ações de captura e exclusão**

Junto das outras ações, depois de `setCampo`:

```js
  // Abre o modal de captura: câmera quando dá, seletor de arquivo sempre.
  abrirCaptura(vistoriaId, ambiente, tipo) {
    const jaTem = this.midiasDo(ambiente, tipo).length;
    if (jaTem >= Midias.LIMITES[tipo].max) {
      Utils.toast(Midias.validar(tipo, { type: Midias.LIMITES[tipo].mimes[0], size: 1 }, jaTem), 'error');
      return;
    }
    this.captura = { vistoriaId, ambiente, tipo };
    const modal = document.getElementById('captura-modal');
    modal.style.display = 'flex';
    Midias.abrirCamera(document.getElementById('captura-video'), tipo === 'video');
  },

  fecharCaptura() {
    Midias.pararGravacao();
    Midias.fecharCamera();
    this.captura = null;
    const modal = document.getElementById('captura-modal');
    if (modal) modal.style.display = 'none';
  },

  // Vem da câmera (blob pronto) ou do seletor de arquivo (File).
  async guardar(arquivo) {
    const c = this.captura;
    if (!c || !arquivo) return;
    const criada = await Midias.enviar(
      c.vistoriaId, c.ambiente, c.tipo, arquivo, this.midiasDo(c.ambiente, c.tipo).length);
    this.fecharCaptura();
    if (criada) {
      this.midias.push(criada);
      Utils.toast(c.tipo === 'foto' ? 'Foto anexada.' : 'Vídeo anexado.');
      this.render(document.getElementById('main-content'));
    }
  },

  async excluirMidia(vistoriaId, midiaId) {
    if (!confirm('Remover esta mídia da vistoria?')) return;
    try {
      await Api.removerMidia(midiaId);
    } catch (e) {
      Utils.toast('Não foi possível remover: ' + (e.message || ''), 'error');
      return;
    }
    this.midias = this.midias.filter(m => m.id !== midiaId);
    this.render(document.getElementById('main-content'));
  },
```

E o modal de captura, no fim do markup de `renderDetalhe` (antes da crase final):

```js
      <div id="captura-modal" class="modal-backdrop">
        <div class="modal-card">
          <h3>Anexar ao ambiente</h3>
          <video id="captura-video" autoplay playsinline muted
            style="width:100%; max-height:280px; background:#000; border-radius:12px;"></video>
          <div class="modal-actions">
            <input type="file" id="captura-arquivo" style="display:none"
              accept="image/*,video/*" capture="environment"
              onchange="Vistorias.guardar(this.files[0])">
            <button type="button" class="btn btn-secondary"
              onclick="document.getElementById('captura-arquivo').click()">Escolher arquivo</button>
            <button type="button" class="btn btn-secondary" onclick="Vistorias.fecharCaptura()">Cancelar</button>
            <button type="button" class="btn btn-primary" onclick="Vistorias.capturar()">Capturar</button>
          </div>
        </div>
      </div>
```

E a ação do botão Capturar, que separa foto de vídeo:

```js
  // Foto sai num quadro; vídeo alterna gravar/parar no mesmo botão.
  capturar() {
    const video = document.getElementById('captura-video');
    if (!this.captura) return;
    if (this.captura.tipo === 'foto') {
      Midias.fotografar(video).then(blob => this.guardar(blob));
      return;
    }
    if (Midias.gravando()) { Midias.pararGravacao(); return; }
    Midias.gravar(blob => this.guardar(blob));
    Utils.toast(`Gravando — para sozinho em ${Midias.LIMITES.video.segundos}s.`);
  },
```

- [ ] **Step 4: Reindexar ao remover ambiente**

Em `removerAmbiente`, depois do `Storage.saveInspection`:

```js
    // As mídias seguem o índice do ambiente: sem reindexar, a foto da cozinha
    // passa a ilustrar a sala.
    Api.reindexarMidias(id, i)
      .then(() => this.recarregarMidias(id))
      .catch(e => Utils.toast('As fotos deste ambiente podem ter ficado fora de lugar: ' + (e.message || ''), 'error'));
```

- [ ] **Step 5: Progresso no aside**

No cartão Resumo, depois da linha de Ambientes:

```js
              <div class="mini-bar-head" style="margin:0;">
                <span class="text-muted">Com mídia</span>
                <b>${rooms.filter((_, i) => this.midiasDo(i).length).length} de ${rooms.length}</b>
              </div>
```

E o texto do cartão "Fotos" do aside sai — a funcionalidade existe agora. No lugar:

```js
          <div class="card">
            <div class="painel-secao-head" style="margin-bottom:8px;"><h4>Como fica guardado</h4></div>
            <p class="text-muted" style="font-size:13px; margin:0;">
              Foto e vídeo ficam no servidor, ligados ao ambiente. Só quem está nesta conta
              consegue abrir. Ao fechar a vistoria, tudo vira leitura.
            </p>
          </div>
```

- [ ] **Step 6: CSS**

Em `public/css/dashboard.css`, junto de `.vistoria-layout`:

```css
/* — Estado do ambiente: três botões no lugar do select —
   Um toque em vez de dois (abrir, escolher), e a cor comunica antes da leitura.
   O select ainda faz sentido em formulário longo; aqui a escolha é de três. */
.estado-botoes {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.estado-botao {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--card-bg);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 13.5px;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}

.estado-botao:hover:not(:disabled) { border-color: var(--border-focus); }
.estado-botao:disabled { cursor: default; opacity: 0.7; }

.estado-botao.ativo {
  font-weight: 600;
  color: var(--text-main);
  border-color: var(--border-focus);
  background: var(--primary-light);
}

/* — Faixa de mídia do ambiente —
   Rola na horizontal em vez de quebrar em grade: a leitura é "o que tem deste
   cômodo", e a fila mantém isso em uma linha só. */
.midia-faixa {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 6px;
  margin-bottom: 12px;
}

.midia-item {
  position: relative;
  flex: 0 0 auto;
  margin: 0;
  width: 116px;
  height: 116px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.midia-item img,
.midia-item video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.midia-remover {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.midia-add {
  flex: 0 0 auto;
  width: 116px;
  height: 116px;
  border: 1px dashed var(--border-focus);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--primary);
  font-family: var(--font-sans);
  font-size: 13.5px;
  cursor: pointer;
}

.midia-add:hover { background: var(--primary-light); }
```

Conferir com `node public/js/tokens.test.js` que nenhum `var()` usado aqui é órfão — `--bg-subtle`, `--primary-light`, `--border-focus` e `--radius-full` precisam existir; se algum não existir, trocar pelo token equivalente que o arquivo de tokens declara, nunca criar hex cravado (R6.1).

- [ ] **Step 7: Auditoria de runtime**

Com `npm start` rodando, num navegador de verdade:

1. Abrir uma vistoria em rascunho, tirar uma foto pela câmera, ver a miniatura aparecer.
2. Recarregar a página e confirmar que a foto continua lá (veio do servidor, não da memória).
3. Gravar um vídeo curto e confirmar que ele toca no cartão.
4. Negar a permissão da câmera e confirmar que "Escolher arquivo" ainda anexa.
5. Tentar anexar um PDF pelo seletor: tem que recusar com mensagem, sem chamar o servidor.
6. Remover o primeiro ambiente e confirmar que as fotos dos outros continuam nos ambientes certos.
7. Fechar a vistoria e confirmar que a mídia continua visível e os botões somem.
8. Console sem erro em todos os passos.

Anotar o resultado — ele vai no CHANGELOG na Task 7.

- [ ] **Step 8: Commit**

```bash
git add public/js/vistorias.js public/css/dashboard.css
git commit -m "feat(vistorias): faixa de foto e video por ambiente e cartao reorganizado"
```

---

### Task 7: Consequências registradas — ignore, docs e changelog

**Files:**
- Modify: `.gitignore`, `README.md`, `docs/ARQUITETURA.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: o resultado da auditoria da Task 6.
- Produces: nada de código.

- [ ] **Step 1: `.gitignore`**

```
# Mídia das vistorias: arquivo de cliente não é artefato de repositório.
uploads/
```

- [ ] **Step 2: `README.md`**

Na seção de como rodar/guardar dados, acrescentar:

```markdown
### Backup são duas coisas

`data.db` guarda os registros; `uploads/` guarda as fotos e vídeos das
vistorias. Copiar só um dos dois restaura vistorias com mídia quebrada —
a linha aponta para um arquivo que não existe mais. Copie os dois juntos.
```

- [ ] **Step 3: `docs/ARQUITETURA.md`**

Acrescentar `midias` à descrição do banco (deixando explícito que **não** está em `RECURSOS` e por quê), `server/rotas/midias.js` ao mapa de módulos, e na Parte III (pendências):

```markdown
- **Cota de disco por conta** (aberta desde 27/08): com 8 fotos e 2 vídeos por
  ambiente, uma vistoria de 5 ambientes chega a ~250 MB. Rodando local e com um
  dono só, é aceitável; num deploy multiusuário, não. Não há cota hoje.
```

- [ ] **Step 4: `CHANGELOG.md`**

Entrada do dia descrevendo: o que passou a existir (foto e vídeo por ambiente), as três decisões do dono do projeto e o preço de cada uma (varredura de órfão, backup em duas partes, fallback de arquivo ao lado da câmera), a reindexação do ambiente, e **o resultado da auditoria de runtime da Task 6** — quantos passos, o que foi percorrido, se houve erro de console.

- [ ] **Step 5: Rodar a suíte inteira uma última vez**

Run: `npm test`
Expected: backend e front, tudo verde.

- [ ] **Step 6: Commit**

```bash
git add .gitignore README.md docs/ARQUITETURA.md CHANGELOG.md
git commit -m "docs: registrar midia da vistoria, backup em duas partes e cota de disco pendente"
```
