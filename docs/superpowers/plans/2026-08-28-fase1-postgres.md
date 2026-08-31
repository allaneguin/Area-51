# Fase 1 — Postgres na Supabase — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `server/db.js` passa a falar com o Postgres da Supabase em vez do `node:sqlite` local, mantendo servidor, login, `limite.js` e o comportamento dos 59 testes de backend idêntico — e os dados de `data.db` migrados para o banco novo.

**Architecture:** `db.js` vira um `pg.Pool` por trás de uma casca (`prepare(sql).get/all/run`) com a MESMA forma de chamada do `node:sqlite` de hoje — isso é o que mantém o diff nas rotas restrito a "acrescentar `await`", em vez de reescrever cada consulta. Toda query síncrona vira assíncrona (não existe SQL síncrono contra um banco de rede), então cada handler de rota que toca o banco passa a ser `async`. Dois efeitos de borda do Postgres, opostos ao que a saída da Supabase corrigiu em 26/08, têm task própria: `jsonb` chega **já parseado** (o SQLite devolvia string) e `count(*)` chega como **string** (tipo `bigint` do Postgres).

**Tech Stack:** Node 24 + Express 5 (middleware assíncrono nativo, sem wrapper) + `pg` 8.x (segunda dependência) + PostgreSQL 17 via Supabase.

**Desvio deliberado do spec, registrado:** o spec (§Fase 1) cita de passagem "text vira timestamptz onde fizer sentido". Este plano mantém TODAS as colunas de data/hora como `text` (idêntico ao SQLite). Motivo: `pg` devolve `timestamptz` já como objeto `Date` do JS, não como string ISO — e o teste `'gravacao parcial de registro existente persiste'` compara `created_at` contra a STRING literal `'2020-01-01T00:00:00.000Z'` com `assert.strictEqual`. Trocar o tipo quebraria esse e outros testes por um ganho que a Fase 1 não pede (nada aqui faz aritmética de data no SQL). Fica registrado como possível trabalho futuro, não como pendência desta fase.

**Segundo desvio, também deliberado:** o spec sugere "um Postgres (Docker, ou um segundo projeto Supabase só para teste)" para isolar os testes. Este plano usa, em vez disso, um ESQUEMA descartável dentro do MESMO projeto Supabase para desenvolvimento local (Task 1) e um container `postgres:17` efêmero do próprio GitHub Actions para CI (Task 7) — nenhum dos dois exige Docker na máquina do dono nem um segundo projeto para manter. O isolamento real (dados de teste nunca tocam o schema `public`) é o mesmo; o custo de infraestrutura é menor.

**Spec:** `docs/superpowers/specs/2026-08-28-volta-supabase-design.md`

## Global Constraints

- **Servidor, login e os 59 testes de backend continuam de pé** ao final — nenhum teste existente muda de intenção, só de implementação onde o dialeto exige.
- **Nenhuma dependência nova além de `pg`.** Nada de `dotenv`, `knex`, ORM. O `.env` é lido por um loader de ~15 linhas em `node:fs`.
- **`.env` nunca é commitado.** Já está no `.gitignore`; qualquer variável nova nele segue assim.
- **`DATABASE_URL` usa a conexão DIRETA (porta 5432), nunca o "Transaction pooler" (porta 6543).** O pool depende de `search_path` fixo por conexão para isolar os testes; o Transaction pooler não garante a mesma conexão física entre comandos.
- **Nenhuma query SQL contém `?` dentro de uma string literal** — premissa que permite traduzir `?`→`$1,$2,...` por substituição posicional simples. Confirmado por leitura de todas as queries do projeto.
- **Todo `count(*)` ganha `::int`.** O tipo `bigint` do Postgres volta como STRING no `pg`; comparação teria de conferir `===` contra número.
- **`npm test` passa por inteiro ao fim do trabalho.**

---

### Task 1: Ambiente — `.env`, `pg`, e `db.js` reescrito

**Files:**
- Create: `server/env.js`
- Create: `server/db.test.js`
- Modify: `server/db.js` (reescrita completa)
- Modify: `package.json` (dependência `pg`, script `test` ganha `db.test.js`)
- Modify: `.gitignore` (nenhuma mudança necessária — `.env` já coberto; conferir)

**Interfaces:**
- Consumes: `process.env.DATABASE_URL`, `process.env.PG_SCHEMA` (opcional).
- Produces: `require('./db')` exporta `{ db, pronto, RECURSOS, paraFora, paraDentro, PASTA_UPLOADS }`. `db.prepare(sql)` devolve `{ get(...params), all(...params), run(...params) }`, todos **assíncronos** (devolvem Promise). `pronto` é uma Promise que resolve quando o schema existe e `uploads/` foi criada — quem inicia o servidor espera por ela ANTES de aceitar tráfego; rota nenhuma espera por ela.

- [ ] **Step 1: Instalar o `pg`**

```bash
npm install pg@^8.23.0
```

- [ ] **Step 2: Criar o loader de `.env`**

Criar `server/env.js`:

```js
// ═══════════════════════════════════════════════════════
// Carrega .env para process.env — sem dependência nova.
//
// Não é um parser de .env geral: só entende "CHAVE=valor", uma por linha,
// comentário com #. É o que as 4 variáveis deste projeto precisam, e nada
// além disso. Se um dia o valor precisar de aspas ou quebra de linha, AÍ
// se justifica trocar por uma biblioteca.
//
// Variável já definida no ambiente NUNCA é sobrescrita: é assim que o CI
// (que define DATABASE_URL direto, sem arquivo) e o `.env` local convivem
// com o mesmo código, sem `if` espalhado perguntando onde está rodando.
// ═══════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.join(__dirname, '..', '.env');

if (fs.existsSync(ARQUIVO)) {
  for (const linha of fs.readFileSync(ARQUIVO, 'utf8').split('\n')) {
    const l = linha.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 0) continue;
    const chave = l.slice(0, i).trim();
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = l.slice(i + 1).trim();
  }
}
```

- [ ] **Step 3: Reescrever `server/db.js`**

Substituir o arquivo inteiro por:

```js
// ═══════════════════════════════════════════════════════
// Banco — Postgres na Supabase, via `pg`.
//
// Até 27/08 este arquivo falava com node:sqlite, síncrono, em arquivo local.
// Decisão do dono do projeto em 28/08 (ver
// docs/superpowers/specs/2026-08-28-volta-supabase-design.md): voltar para um
// Postgres hospedado, com painel — o motivo era poder ver e editar o banco sem
// terminal.
//
// A casca `db.prepare(sql).get/all/run(...)` continua com a MESMA forma que o
// node:sqlite tinha. É isso que restringe o diff das rotas a "acrescentar
// await": toda chamada agora é assíncrona porque não existe SQL síncrono
// contra um banco de rede, mas a query em si e a ordem dos parâmetros não
// mudam.
//
// A parte que importa deste arquivo continua sendo o mapa RECURSOS: é a ÚNICA
// lista branca de nomes de tabela que vira SQL.
// ═══════════════════════════════════════════════════════

require('./env');

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL não definida. Veja README.md — "Variáveis de ambiente".'
  );
}

// Testes rodam num ESQUEMA descartável dentro do MESMO banco: cria antes da
// suíte, apaga depois (server/db.test.js e server/servidor.test.js fazem
// isso). Isola os dados de teste dos de verdade sem exigir um segundo projeto
// Supabase nem Docker — o preço documentado no spec (§3, Fase 1) por não
// pagar essa infraestrutura agora.
//
// `options` aplica o search_path em toda conexão nova do pool. Isto só
// funciona porque a connection string usa a porta 5432 (conexão DIRETA ou
// "Session pooler") — o "Transaction pooler" (6543) não garante a mesma
// conexão física entre comandos, e o search_path se perderia no meio.
const ESQUEMA = process.env.PG_SCHEMA || 'public';
if (!/^[a-z0-9_]+$/.test(ESQUEMA)) {
  throw new Error('PG_SCHEMA inválido: ' + ESQUEMA);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // A Supabase exige TLS. `rejectUnauthorized: false` aceita o certificado
  // sem validar a cadeia — o tráfego continua cifrado, só não confere quem o
  // assinou. É a configuração que a própria Supabase recomenda para `pg`;
  // apertar isso exige importar o bundle de CA deles.
  ssl: { rejectUnauthorized: false },
  options: `-c search_path=${ESQUEMA}`
});

// ── Schema ──────────────────────────────────────────────────────────────
//
// `create schema if not exists` primeiro, na MESMA query multi-comando: o
// search_path é resolvido de novo a cada instrução dentro da transação
// implícita do `pool.query`, então o schema já existe a tempo das tabelas
// seguintes serem criadas dentro dele.
const SCHEMA_SQL = `
create schema if not exists "${ESQUEMA}";

create table if not exists users (
  id            text primary key,
  email         text not null unique,
  senha_hash    text not null,
  salt          text not null,
  is_admin      integer not null default 0,
  criado_em     text not null,
  ultimo_login  text
);
-- SQLite tinha "collate nocase" na coluna; Postgres não tem colação
-- case-insensitive sem extensão. Um índice único sobre lower(email) dá a
-- MESMA garantia (duas contas não podem diferir só na caixa), e toda consulta
-- por e-mail no código compara lower(email) = lower($n).
create unique index if not exists users_email_lower_idx on users (lower(email));

create table if not exists sessions (
  token      text primary key,
  user_id    text not null references users(id) on delete cascade,
  expira_em  text not null
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists contracts (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  name         text not null,
  template_id  text not null,
  fields       jsonb not null default '{}',
  is_finalized integer not null default 0,
  cloud_id     text,
  cloud_key    text,
  created_at   text not null,
  updated_at   text not null
);

create table if not exists profiles (
  id           text primary key references users(id) on delete cascade,
  profile_data jsonb not null default '{}',
  updated_at   text not null
);

create table if not exists properties (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  address text not null,
  cep text,
  type text not null default 'Residencial',
  bedrooms integer default 0,
  bathrooms integer default 0,
  parking integer default 0,
  area real default 0,
  rent_value real default 0,
  iptu_value real default 0,
  condo_value real default 0,
  status text not null default 'Disponível',
  notes text,
  created_at text not null,
  updated_at text not null
);

create table if not exists clients (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  client_type text not null default 'Inquilino',
  person_type text not null default 'PF',
  document text not null,
  rg text,
  phone text,
  email text,
  address text,
  profession text,
  income real default 0,
  notes text,
  created_at text not null,
  updated_at text not null
);

create table if not exists financial_records (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  contract_id text,
  description text not null,
  tenant_name text,
  landlord_name text,
  due_date text not null,
  rent_value real not null default 0,
  fee_percent real not null default 10,
  fee_value real not null default 0,
  net_payout real not null default 0,
  status text not null default 'Pendente',
  paid_at text,
  notes text,
  created_at text not null,
  updated_at text not null
);

create table if not exists inspections (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  property_id text,
  contract_id text,
  tipo text not null default 'Entrada',
  status text not null default 'Rascunho',
  tenant_name text,
  inspected_on text,
  notes text,
  rooms jsonb not null default '[]',
  closed_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists tenant_links (
  id                text primary key,
  encrypted_payload text not null,
  key_proof         text,
  finalized         integer not null default 0,
  finalized_at      text,
  finalized_ip      text,
  created_by        text references users(id) on delete cascade,
  created_at        text not null,
  expires_at        text not null
);
create index if not exists tenant_links_criador_idx
  on tenant_links (created_by, created_at desc);

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
`;

// ── Pasta dos arquivos de mídia (Fase 2 move isto para o Storage) ───────
const PASTA_UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');

// Roda uma vez, no boot. Quem SERVE TRÁFEGO (index.js, servidor.test.js)
// espera por esta promise antes de aceitar requisição — se o servidor já
// está ouvindo, o schema já existe, e nenhuma rota precisa esperar de novo.
const pronto = pool.query(SCHEMA_SQL).then(() => {
  fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
});

// ── Traduz "?" posicional (estilo SQLite) para "$1, $2, ..." ────────────
// Nenhuma query deste projeto tem "?" dentro de uma string SQL — é o que
// torna esta troca posicional simples segura.
function paraPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

// Mesma FORMA que o node:sqlite: quem já chama `.get()/.all()/.run()` só
// precisa acrescentar `await`. Por baixo, tudo agora é assíncrono.
function prepare(sql) {
  const texto = paraPostgres(sql);
  return {
    async get(...params) {
      const r = await pool.query(texto, params);
      return r.rows[0];
    },
    async all(...params) {
      const r = await pool.query(texto, params);
      return r.rows;
    },
    async run(...params) {
      const r = await pool.query(texto, params);
      return { changes: r.rowCount };
    }
  };
}

const db = { prepare };

// ── Mapa dos recursos com CRUD genérico ─────────────────────────────────
//
// `json`: colunas `jsonb`. O driver do Postgres já devolve estas colunas
// PARSEADAS (objeto/array) — ao contrário do node:sqlite, que sempre devolvia
// texto. `paraFora` só faz `JSON.parse` quando o valor ainda for string.
//
// `bool`: Postgres também não tem boolean nativo usado aqui — a coluna
// continua `integer` 0/1, igual ao SQLite, para não introduzir uma segunda
// representação de boolean no meio da migração.
//
// `profiles` NÃO está aqui de propósito: não tem coluna user_id (a chave
// primária É o usuário) e teria de virar exceção dentro do middleware de
// escopo. Ela tem rotas próprias em rotas/perfil.js.
const RECURSOS = {
  contracts: {
    colunas: ['id', 'user_id', 'name', 'template_id', 'fields', 'is_finalized',
      'cloud_id', 'cloud_key', 'created_at', 'updated_at'],
    json: ['fields'],
    bool: ['is_finalized']
  },
  properties: {
    colunas: ['id', 'user_id', 'name', 'address', 'cep', 'type', 'bedrooms',
      'bathrooms', 'parking', 'area', 'rent_value', 'iptu_value', 'condo_value',
      'status', 'notes', 'created_at', 'updated_at'],
    json: [], bool: []
  },
  clients: {
    colunas: ['id', 'user_id', 'name', 'client_type', 'person_type', 'document',
      'rg', 'phone', 'email', 'address', 'profession', 'income', 'notes',
      'created_at', 'updated_at'],
    json: [], bool: []
  },
  financial_records: {
    colunas: ['id', 'user_id', 'contract_id', 'description', 'tenant_name',
      'landlord_name', 'due_date', 'rent_value', 'fee_percent', 'fee_value',
      'net_payout', 'status', 'paid_at', 'notes', 'created_at', 'updated_at'],
    json: [], bool: []
  },
  inspections: {
    colunas: ['id', 'user_id', 'property_id', 'contract_id', 'tipo', 'status',
      'tenant_name', 'inspected_on', 'notes', 'rooms', 'closed_at',
      'created_at', 'updated_at'],
    json: ['rooms'], bool: []
  }
};

// ── Conversão de borda ──────────────────────────────────────────────────

// Linha do Postgres → forma que o front espera.
function paraFora(linha, meta) {
  if (!linha) return linha;
  const fora = { ...linha };
  for (const c of meta.json) {
    // O driver já entrega jsonb parseado (objeto/array) — este `typeof` é
    // defensivo, não compatibilidade com SQLite (que saiu com esta migração).
    // Uma coluna jsonb bem formada nunca cai no `try`; ele sobra como rede
    // contra um `RECURSOS.json` mal configurado apontando pra coluna errada.
    if (typeof fora[c] === 'string') {
      try {
        fora[c] = JSON.parse(fora[c]);
      } catch {
        fora[c] = fora[c].trimStart().startsWith('[') ? [] : {};
      }
    }
  }
  for (const c of meta.bool) fora[c] = !!fora[c];
  return fora;
}

// Objeto do front → valores que o driver aceita.
// `pg` NÃO stringifica objeto/array sozinho: um array passado direto vira
// literal de ARRAY do Postgres (não JSON), e corromperia a coluna jsonb.
// Por isso todo valor de coluna JSON sai daqui como STRING — Postgres aceita
// texto contra coluna jsonb e valida/converte sozinho.
function paraDentro(valor, coluna, meta) {
  if (meta.json.includes(coluna)) {
    if (valor === undefined || valor === null) return coluna === 'rooms' ? '[]' : '{}';
    return typeof valor === 'string' ? valor : JSON.stringify(valor);
  }
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  if (typeof valor === 'object') return JSON.stringify(valor);
  return valor;
}

module.exports = { db, pronto, RECURSOS, paraFora, paraDentro, PASTA_UPLOADS };
```

- [ ] **Step 4: Escrever o teste que prova a fundação, sem tocar em rota nenhuma**

Criar `server/db.test.js`:

```js
// Teste da fundação: conexão, schema, e as duas armadilhas de tipo que trocam
// de lado ao vir do SQLite para o Postgres (jsonb chega parseado; count(*)
// chega como string). Nenhuma rota entra aqui — é db.js sozinho.
// Rodar: node --no-warnings=ExperimentalWarning --test server/db.test.js
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

process.env.PG_SCHEMA = 'mi_dbtest_' + process.pid;

const { db, pronto, RECURSOS, paraFora, paraDentro } = require('./db');

test.before(() => pronto);

test.after(async () => {
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await p.query(`drop schema if exists "${process.env.PG_SCHEMA}" cascade`);
  await p.end();
});

test('conecta e cria o schema', async () => {
  const r = await db.prepare('select 1 as x').get();
  assert.strictEqual(r.x, 1);
});

test('jsonb volta parseado — paraFora nao quebra recebendo objeto pronto', async () => {
  const id = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await db.prepare(`
    insert into users (id, email, senha_hash, salt, criado_em)
    values ($1, $2, 'x', 'y', $3)
  `).run(userId, `${id}@teste.com`, new Date().toISOString());

  const meta = RECURSOS.contracts;
  const dentro = paraDentro({ valor_aluguel: 'R$ 1.500,00', lista: [1, 2, 3] }, 'fields', meta);
  assert.strictEqual(typeof dentro, 'string', 'paraDentro sempre manda string para o driver');

  await db.prepare(`
    insert into contracts (id, user_id, name, template_id, fields, created_at, updated_at)
    values ($1, $2, 'Teste', 'residencial', $3, $4, $4)
  `).run(id, userId, dentro, new Date().toISOString());

  const linha = await db.prepare('select * from contracts where id = $1').get(id);
  assert.strictEqual(typeof linha.fields, 'object',
    'o driver ja devolve jsonb parseado — se isto for string, paraFora nao tratou os dois casos');

  const fora = paraFora(linha, meta);
  assert.strictEqual(fora.fields.valor_aluguel, 'R$ 1.500,00');
  assert.deepStrictEqual(fora.fields.lista, [1, 2, 3]);
});

test('count(*) sem ::int volta STRING, nao numero — a armadilha que todo count precisa evitar', async () => {
  const semCast = await db.prepare('select count(*) c from users').get();
  assert.strictEqual(typeof semCast.c, 'string',
    'prova que o cuidado de por ::int em todo count(*) do projeto e necessario');

  const comCast = await db.prepare('select count(*)::int c from users').get();
  assert.strictEqual(typeof comCast.c, 'number');
});
```

- [ ] **Step 2: Rodar e ver passar**

Run: `node --no-warnings=ExperimentalWarning --test server/db.test.js`
Expected: 3 testes passam (a conexão real com a Supabase já foi confirmada manualmente antes deste plano).

- [ ] **Step 3: Ligar na suíte e ajustar `.gitignore`**

Em `package.json`, no início da cadeia do script `test` (antes de `server/servidor.test.js`, para falhar cedo e barato se a fundação estiver quebrada):

```
"test": "node --no-warnings=ExperimentalWarning --test server/db.test.js && node --no-warnings=ExperimentalWarning --test server/servidor.test.js && node public/js/busca.test.js && node public/js/tokens.test.js && node public/js/dashboard.test.js && node public/js/financeiro.test.js && node public/js/ingestao.test.js && node public/js/prazo.test.js && node public/js/properties.test.js && node public/js/seguranca.test.js && node public/js/superadmin.test.js && node public/js/vistorias.test.js && node public/js/gerador.test.js && node public/js/midias.test.js && node public/js/sintaxe.test.js"
```

Conferir `.gitignore` já tem `.env` (linha 21, confirmado antes deste plano) — nenhuma mudança necessária.

`npm test` vai FALHAR neste ponto (server/servidor.test.js ainda fala com node:sqlite via `DB_FILE`, que não existe mais como caminho relevante) — é esperado; a Task 2 resolve.

- [ ] **Step 4: Commit**

```bash
git add server/env.js server/db.js server/db.test.js package.json
git commit -m "feat(supabase): db.js fala com Postgres via pg, mantendo a forma prepare().get/all/run"
```

---

### Task 2: Autenticação e sessão assíncronas

**Files:**
- Modify: `server/sessao.js`
- Modify: `server/index.js`
- Modify: `server/rotas/auth.js`
- Modify: `server/servidor.test.js` (bootstrap + seção de contas/sessão)

**Interfaces:**
- Consumes: `db.prepare(sql).get/all/run(...)` (assíncrono, Task 1), `pronto` (Task 1).
- Produces: `usuarioDaSessao(req)`, `abrirSessao(res, userId)`, `fecharSessao(req, res)` — todas `async function`, chamadas com `await` por quem as usa (`exigirLogin` middleware e as rotas de `auth.js`).

**Por que estes quatro arquivos juntos:** nenhum teste de login roda de ponta a ponta se só um deles virar assíncrono — `auth.js` chama `abrirSessao`/`usuarioDaSessao` de `sessao.js`, e o servidor só pode aceitar requisição depois que `db.pronto` resolver. É a menor fatia que fecha um ciclo completo (registrar → logar → sessão expira → sair) e por isso é testável sozinha via `--test-name-pattern`, mesmo com `recursos.js`/`links.js`/`midias.js` ainda síncronos.

- [ ] **Step 1: `server/sessao.js` — todas as funções que tocam banco viram `async`**

Substituir o corpo do arquivo (mantendo os comentários de topo):

```js
const crypto = require('node:crypto');
const { db } = require('./db');

const DIAS = 30;
const CUSTO = { N: 16384, r: 8, p: 1 };   // ~100ms por hash nesta máquina
const TAMANHO_HASH = 64;

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, TAMANHO_HASH, CUSTO).toString('hex');
}

function criarSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, senha_hash: hashSenha(senha, salt) };
}

function conferirSenha(senha, salt, esperado) {
  const a = Buffer.from(hashSenha(senha, salt), 'hex');
  const b = Buffer.from(esperado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const NOME_COOKIE = 'sessao';

async function abrirSessao(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DIAS * 864e5).toISOString();

  await db.prepare('insert into sessions (token, user_id, expira_em) values (?, ?, ?)')
    .run(token, userId, expira);

  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: !!process.env.HTTPS,
    maxAge: DIAS * 864e5,
    path: '/'
  });
  return token;
}

async function fecharSessao(req, res) {
  const token = lerCookie(req);
  if (token) await db.prepare('delete from sessions where token = ?').run(token);
  res.clearCookie(NOME_COOKIE, { path: '/' });
}

function lerCookie(req) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === NOME_COOKIE) {
      return decodeURIComponent(parte.slice(i + 1).trim());
    }
  }
  return null;
}

async function usuarioDaSessao(req) {
  const token = lerCookie(req);
  if (!token) return null;

  const linha = await db.prepare(`
    select u.id, u.email, u.is_admin, s.expira_em
      from sessions s join users u on u.id = s.user_id
     where s.token = ?
  `).get(token);

  if (!linha) return null;
  if (new Date(linha.expira_em) < new Date()) {
    await db.prepare('delete from sessions where token = ?').run(token);
    return null;
  }
  return { id: linha.id, email: linha.email, is_admin: !!linha.is_admin };
}

// Express 5 encaminha rejeição de middleware assíncrono para o handler de
// erro sozinho — não precisa de wrapper (express-async-handler) para isto.
async function exigirLogin(req, res, next) {
  const u = await usuarioDaSessao(req);
  if (!u) return res.status(401).json({ erro: 'Sessão expirada ou inexistente.' });
  req.usuario = u;
  next();
}

function exigirAdmin(req, res, next) {
  if (!req.usuario || !req.usuario.is_admin) {
    return res.status(403).json({ erro: 'Acesso restrito.' });
  }
  next();
}

module.exports = {
  criarSenha, conferirSenha, hashSenha,
  abrirSessao, fecharSessao, usuarioDaSessao,
  exigirLogin, exigirAdmin, NOME_COOKIE
};
```

(`CUSTO` é copiado **exatamente** do arquivo atual — `{ N: 16384, r: 8, p: 1 }` — nenhuma mudança de custo do scrypt faz parte desta task. A única diferença do arquivo original é `async`/`await` nas funções que tocam o banco.)

- [ ] **Step 2: `server/index.js` — esperar `pronto` antes de ouvir**

No topo, depois dos outros `require`:

```js
const { pronto } = require('./db');
```

No fim do arquivo, substituir:

```js
if (require.main === module) {
  app.listen(PORTA, () => {
    console.log(`Meus Imóveis em http://localhost:${PORTA}`);
  });
}
```

por:

```js
if (require.main === module) {
  // Só abre a porta depois que o schema existe — antes disso, qualquer
  // requisição bateria num banco sem tabela.
  pronto.then(() => {
    app.listen(PORTA, () => {
      console.log(`Meus Imóveis em http://localhost:${PORTA}`);
    });
  }).catch(err => {
    console.error('Não foi possível preparar o banco:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 3: `server/rotas/auth.js` — handlers viram `async`, e-mail vira case-insensitive, `count(*)` ganha `::int`**

Substituir as rotas de `/registrar` e `/entrar`:

```js
router.post('/registrar', limiteCadastro, async (req, res) => {
  const email = String(req.body.email || '').trim();
  const senha = req.body.senha;

  const erro = validar(email, senha);
  if (erro) return res.status(400).json({ erro });

  const existe = await db.prepare('select id from users where lower(email) = lower(?)').get(email);
  if (existe) return res.status(409).json({ erro: 'already registered' });

  const { salt, senha_hash } = criarSenha(senha);
  const { c } = await db.prepare('select count(*)::int c from users').get();
  const user = {
    id: crypto.randomUUID(),
    email,
    // Primeira conta do banco vira admin. Sem isso não haveria como chegar na
    // tela de administração num banco recém-criado, e a alternativa seria um
    // usuário-semente com senha fixa no código.
    is_admin: c === 0 ? 1 : 0
  };

  await db.prepare(`
    insert into users (id, email, senha_hash, salt, is_admin, criado_em)
    values (?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, senha_hash, salt, user.is_admin, new Date().toISOString());

  await abrirSessao(res, user.id);
  res.status(201).json({ user: publico(user) });
});

router.post('/entrar', limiteLogin, async (req, res) => {
  const email = String(req.body.email || '').trim();
  const senha = String(req.body.senha || '');

  // O limite por IP acima protege a PORTA; este protege a CONTA. Mil endereços
  // fazendo cinco tentativas cada não encostam no teto por IP — e são cinco mil
  // por minuto contra a mesma senha.
  if (limite.contaBloqueada(email)) {
    return res.status(429).json({
      erro: 'Muitas tentativas nesta conta. Espere uma hora e tente de novo.'
    });
  }

  const u = await db.prepare('select * from users where lower(email) = lower(?)').get(email);

  // Mesma resposta para e-mail inexistente e senha errada: distinguir os dois
  // transforma o login num verificador de quem tem conta aqui.
  if (!u || !conferirSenha(senha, u.salt, u.senha_hash)) {
    limite.registrarFalhaDeLogin(email);
    return res.status(401).json({ erro: 'Invalid login credentials' });
  }

  // Acerto zera: sem isto, trancar a conta de alguém de fora seria só queimar
  // as tentativas no e-mail dela.
  limite.limparFalhasDeLogin(email);
  await db.prepare('update users set ultimo_login = ? where id = ?').run(new Date().toISOString(), u.id);
  await abrirSessao(res, u.id);
  res.json({ user: publico(u) });
});
```

E as demais rotas do arquivo:

```js
router.post('/sair', async (req, res) => {
  await fecharSessao(req, res);
  res.json({ ok: true });
});

router.get('/sessao', async (req, res) => {
  res.json({ user: await usuarioDaSessao(req) });
});

router.put('/senha', exigirLogin, limiteLogin, async (req, res) => {
  const senha = req.body.senha;
  if (!senha || String(senha).length < MIN_SENHA) {
    return res.status(400).json({ erro: `A senha precisa ter ao menos ${MIN_SENHA} caracteres.` });
  }

  const { salt, senha_hash } = criarSenha(senha);
  await db.prepare('update users set senha_hash = ?, salt = ? where id = ?')
    .run(senha_hash, salt, req.usuario.id);

  const atual = req.headers.cookie || '';
  const token = (atual.match(/(?:^|;\s*)sessao=([^;]+)/) || [])[1];
  await db.prepare('delete from sessions where user_id = ? and token != ?')
    .run(req.usuario.id, token ? decodeURIComponent(token) : '');

  res.json({ ok: true });
});

router.delete('/conta', exigirLogin, limiteLogin, async (req, res) => {
  const senha = String(req.body.senha || '');
  const u = await db.prepare('select * from users where id = ?').get(req.usuario.id);

  if (!u || !conferirSenha(senha, u.salt, u.senha_hash)) {
    return res.status(401).json({ erro: 'Senha incorreta. Nada foi apagado.' });
  }

  await db.prepare('delete from users where id = ?').run(req.usuario.id);
  await fecharSessao(req, res);
  res.json({ ok: true });
});
```

- [ ] **Step 4: `server/servidor.test.js` — bootstrap espera `pronto`, e a seção de contas/sessão ganha `await`**

Trocar:

```js
const app = require('./index');

let base;
const servidor = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${servidor.address().port}`; });
```

por:

```js
process.env.PG_SCHEMA = 'mi_test_' + process.pid;

const { pronto } = require('./db');
const app = require('./index');

let base, servidor;
test.before(async () => {
  await pronto;
  servidor = app.listen(0);
  base = `http://127.0.0.1:${servidor.address().port}`;
});
```

E, no `test.after`, apagar o esquema de teste em vez de tentar apagar arquivo `data.db` (que não existe mais):

```js
test.after(async () => {
  servidor.close();
  try { fs.rmSync(UPLOADS, { recursive: true, force: true }); } catch {}
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await p.query(`drop schema if exists "${process.env.PG_SCHEMA}" cascade`);
  await p.end();
});
```

Remover as linhas que criavam `DB` (`path.join(os.tmpdir(), ...mi-test-...db)`) e o `process.env.DB_FILE = DB` — não existem mais. Manter `UPLOADS` e `process.env.UPLOADS_DIR` como estão (Fase 2 move isto).

Na seção de contas/sessão, dois ajustes:

```js
test('a senha nao e guardada em claro, e o salt difere entre contas', async () => {
  const { db } = require('./db');
  const a = await db.prepare('select senha_hash, salt from users where email = ?').get('a@teste.com');
  const b = await db.prepare('select senha_hash, salt from users where email = ?').get('b@teste.com');
  assert.ok(!a.senha_hash.includes('segredo123'));
  assert.notStrictEqual(a.salt, b.salt, 'salt igual entre contas anularia o proposito dele');

  const { criarSenha } = require('./sessao');
  assert.notStrictEqual(criarSenha('igual').senha_hash, criarSenha('igual').senha_hash);
});
```

```js
test('sessao expirada e recusada E apagada na leitura', async () => {
  const { db } = require('./db');
  const c = cliente();
  await c('POST', '/api/auth/registrar', { email: 'expira@teste.com', senha: 'segredo123' });
  const u = await db.prepare('select id from users where email = ?').get('expira@teste.com');
  await db.prepare('update sessions set expira_em = ? where user_id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), u.id);

  assert.strictEqual((await c('GET', '/api/contracts')).status, 401);
  const { n } = await db.prepare('select count(*)::int n from sessions where user_id = ?').get(u.id);
  assert.strictEqual(n, 0, 'sessao vencida some na leitura, sem agendador');
});
```

Por fim, acrescentar o caso que a virada para case-insensitive precisa provar (logo após `test('e-mail duplicado e recusado', ...)`):

```js
test('e-mail duplicado com CAIXA diferente tambem e recusado', async () => {
  const r = await cliente()('POST', '/api/auth/registrar', { email: 'A@Teste.com', senha: 'outrasenha' });
  assert.strictEqual(r.status, 409, 'A@Teste.com e a@teste.com sao a MESMA conta');
});

test('login funciona com a caixa do e-mail diferente da do cadastro', async () => {
  const r = await cliente()('POST', '/api/auth/entrar', { email: 'A@TESTE.com', senha: 'segredo123' });
  assert.strictEqual(r.status, 200);
});
```

- [ ] **Step 5: Rodar só a fatia de autenticação/sessão**

Run: `node --no-warnings=ExperimentalWarning --test --test-name-pattern="conta|admin|duplicad|invalid|errada|claro|cookie|sessao|caixa" server/servidor.test.js`
Expected: todos os testes cujo nome bate o padrão passam. **Não** espere a suíte inteira passar ainda — `recursos.js`, `links.js`, `midias.js`, `perfil.js`, `admin.js` continuam síncronos e vão falhar até as próximas tasks.

- [ ] **Step 6: Commit**

```bash
git add server/sessao.js server/index.js server/rotas/auth.js server/servidor.test.js
git commit -m "feat(supabase): autenticacao e sessao assincronas, e-mail case-insensitive"
```

---

### Task 3: CRUD genérico (`recursos.js`) assíncrono

**Files:**
- Modify: `server/rotas/recursos.js`
- Modify: `server/servidor.test.js` (seção de escopo/CRUD)

**Interfaces:**
- Consumes: `db.prepare` async (Task 1), `exigirLogin` async (Task 2).
- Produces: nada que outro arquivo consuma — `recursos.js` é folha.

- [ ] **Step 1: Reescrever os três handlers**

```js
router.get('/:recurso', meta, async (req, res) => {
  const linhas = await db
    .prepare(`select * from ${req.tabela} where user_id = ?`)
    .all(req.usuario.id);
  res.json(linhas.map(l => paraFora(l, req.meta)));
});

router.put('/:recurso/:id', meta, async (req, res) => {
  const id = req.params.id;
  const agora = new Date().toISOString();

  const dono = await db
    .prepare(`select user_id, created_at from ${req.tabela} where id = ?`)
    .get(id);
  if (dono && dono.user_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Este registro é de outra conta.' });
  }

  const entrada = { ...req.body, id, user_id: req.usuario.id };
  entrada.updated_at = agora;
  entrada.created_at = (dono && dono.created_at) || entrada.created_at || agora;

  const cols = req.meta.colunas.filter(c => c in entrada);
  const valores = cols.map(c => paraDentro(entrada[c], c, req.meta));
  const marcas = cols.map(() => '?').join(', ');
  const set = cols
    .filter(c => c !== 'id' && c !== 'user_id' && c !== 'created_at')
    .map(c => `${c} = excluded.${c}`)
    .join(', ');

  await db.prepare(`
    insert into ${req.tabela} (${cols.join(', ')}) values (${marcas})
    on conflict(id) do update set ${set}
  `).run(...valores);

  const salvo = await db.prepare(`select * from ${req.tabela} where id = ?`).get(id);
  res.json(paraFora(salvo, req.meta));
});

router.delete('/:recurso/:id', meta, async (req, res) => {
  const r = await db
    .prepare(`delete from ${req.tabela} where id = ? and user_id = ?`)
    .run(req.params.id, req.usuario.id);

  if (r.changes === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });
  res.json({ ok: true });
});
```

(Nota: `on conflict(id) do update set col = excluded.col` é sintaxe padrão do Postgres, idêntica à do SQLite — nenhuma mudança de SQL aqui, só `await`.)

- [ ] **Step 2: Rodar a fatia de CRUD/escopo**

Run: `node --no-warnings=ExperimentalWarning --test --test-name-pattern="recurso|grava|sobrescreve|apaga|parcial|jsonb|OBJETO|ARRAY|branca" server/servidor.test.js`
Expected: passam. (`'o perfil de A nao vaza para B'` continua falhando — depende de `perfil.js`, Task 6.)

- [ ] **Step 3: Commit**

```bash
git add server/rotas/recursos.js server/servidor.test.js
git commit -m "feat(supabase): CRUD generico assincrono"
```

---

### Task 4: Link do inquilino (`links.js`) assíncrono

**Files:**
- Modify: `server/rotas/links.js`
- Modify: `server/servidor.test.js` (seção de links + o `enviar()`/cookies de mídia, que reaproveita `A`/`B`)

**Interfaces:**
- Consumes: `db.prepare` async, `exigirLogin` async.
- Produces: nada consumido por outro arquivo.

- [ ] **Step 1: Reescrever `expurgar` e as quatro rotas**

```js
async function expurgar() {
  await db.prepare('delete from tenant_links where expires_at < ?').run(agora());
}

router.post('/', exigirLogin, async (req, res) => {
  const { id, payload, key_proof } = req.body || {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ erro: 'Id do link ausente.' });
  }
  if (typeof payload !== 'string' || !payload) {
    return res.status(400).json({ erro: 'Payload ausente.' });
  }
  if (payload.length > TETO_PAYLOAD) {
    return res.status(413).json({ erro: 'Contrato grande demais para o link seguro.' });
  }
  if (key_proof != null && !PROVA.test(key_proof)) {
    return res.status(400).json({ erro: 'Prova de chave malformada.' });
  }

  const ontem = new Date(Date.now() - 864e5).toISOString();
  const { c } = await db.prepare(
    'select count(*)::int c from tenant_links where created_by = ? and created_at > ?'
  ).get(req.usuario.id, ontem);
  if (c >= LIMITE_DIARIO) {
    return res.status(429).json({ erro: 'Limite diário de links atingido.' });
  }

  const jaExiste = await db.prepare('select 1 from tenant_links where id = ?').get(id);
  if (jaExiste) {
    return res.status(409).json({ erro: 'Este id de link já está em uso. Gere outro.' });
  }

  await db.prepare(`
    insert into tenant_links
      (id, encrypted_payload, key_proof, created_by, created_at, expires_at)
    values (?, ?, ?, ?, ?, ?)
  `).run(
    id, payload,
    key_proof ? sha256(key_proof) : null,
    req.usuario.id, agora(),
    new Date(Date.now() + DIAS_VALIDADE * 864e5).toISOString()
  );

  res.status(201).json({ id });
});

router.get('/:id', limiteLeitura, async (req, res) => {
  await expurgar();
  const linha = await db
    .prepare('select encrypted_payload from tenant_links where id = ?')
    .get(req.params.id);

  if (!linha) return res.status(404).json({ erro: 'Link inexistente ou expirado.' });
  res.json({ payload: linha.encrypted_payload });
});

router.get('/:id/evidencia', limiteLeitura, async (req, res) => {
  const linha = await db
    .prepare('select finalized_at, finalized_ip from tenant_links where id = ?')
    .get(req.params.id);

  if (!linha || !linha.finalized_at) return res.json({ evidencia: null });
  res.json({
    evidencia: { finalizado_em: linha.finalized_at, finalizado_ip: linha.finalized_ip || '' }
  });
});

router.put('/:id', limiteEscrita, async (req, res) => {
  const { payload, key_proof, finalize } = req.body || {};

  if (typeof payload !== 'string' || !payload) {
    return res.status(400).json({ erro: 'Payload ausente.' });
  }
  if (payload.length > TETO_PAYLOAD) {
    return res.status(413).json({ erro: 'Contrato grande demais para o link seguro.' });
  }

  await expurgar();
  const linha = await db
    .prepare('select key_proof, finalized from tenant_links where id = ?')
    .get(req.params.id);

  if (!linha) return res.json({ gravou: false });
  if (linha.finalized) return res.json({ gravou: false });

  if (linha.key_proof) {
    if (!key_proof || !PROVA.test(key_proof) || sha256(key_proof) !== linha.key_proof) {
      return res.json({ gravou: false });
    }
  }

  if (finalize === true) {
    await db.prepare(`
      update tenant_links
         set encrypted_payload = ?, finalized = 1,
             finalized_at = ?, finalized_ip = ?,
             expires_at = ?
       where id = ? and finalized = 0
    `).run(
      payload, agora(), ipDe(req),
      new Date(Date.now() + 7 * 864e5).toISOString(),
      req.params.id
    );
  } else {
    await db.prepare(
      'update tenant_links set encrypted_payload = ? where id = ? and finalized = 0'
    ).run(payload, req.params.id);
  }

  res.json({ gravou: true });
});
```

- [ ] **Step 2: `server/servidor.test.js` — `await` nos acessos diretos da seção de links**

```js
test('a prova guardada no banco NAO e a prova que o servidor cobra', async () => {
  const { db } = require('./db');
  const linha = await db.prepare('select key_proof from tenant_links where id = ?').get('l1');
  assert.notStrictEqual(linha.key_proof, PROVA);
  assert.strictEqual(linha.key_proof, sha256(PROVA));
});
```

```js
test('o IP do aceite NAO sai de cabecalho que o signatario manda', async () => {
  await A('POST', '/api/links', { id: 'l-xff', payload: 'v1', key_proof: PROVA });
  const r = await fetch(base + '/api/links/l-xff', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' },
    body: JSON.stringify({ payload: 'assinado', key_proof: PROVA, finalize: true })
  });
  assert.strictEqual((await r.json()).gravou, true);

  const { db } = require('./db');
  const linha = await db.prepare('select finalized_ip from tenant_links where id = ?').get('l-xff');
  assert.notStrictEqual(linha.finalized_ip, '8.8.8.8', 'cabecalho forjado nao pode virar evidencia');
  assert.ok(/^(::1|127\.)/.test(linha.finalized_ip), 'vale o endereco do socket: ' + linha.finalized_ip);
});
```

```js
test('link inexistente e link expirado dao 404', async () => {
  assert.strictEqual((await anon('GET', '/api/links/nao-existe')).status, 404);

  const { db } = require('./db');
  await A('POST', '/api/links', { id: 'velho', payload: 'x', key_proof: PROVA });
  await db.prepare('update tenant_links set expires_at = ? where id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), 'velho');

  assert.strictEqual((await anon('GET', '/api/links/velho')).status, 404);
  const { n } = await db.prepare('select count(*)::int n from tenant_links where id = ?').get('velho');
  assert.strictEqual(n, 0, 'expirado some na leitura — e o que substitui o pg_cron');
});
```

- [ ] **Step 3: Rodar a fatia de links**

Run: `node --no-warnings=ExperimentalWarning --test --test-name-pattern="link|prova|finaliz|evidencia|payload|IP do aceite" server/servidor.test.js`
Expected: passam.

- [ ] **Step 4: Commit**

```bash
git add server/rotas/links.js server/servidor.test.js
git commit -m "feat(supabase): link do inquilino assincrono"
```

---

### Task 5: Mídia (`midias.js`) assíncrona

**Files:**
- Modify: `server/rotas/midias.js`
- Modify: `server/servidor.test.js` (seção de mídia)

**Interfaces:**
- Consumes: `db.prepare` async, `exigirLogin` async, `PASTA_UPLOADS` (Task 1, inalterado).
- Produces: `varrer` e `TIPOS` continuam exportados (`module.exports.varrer`, `module.exports.TIPOS`), agora `varrer` é `async function`.

- [ ] **Step 1: `varrer`, `vistoriaDaSessao` e as cinco rotas**

```js
async function varrer() {
  let nomes;
  try { nomes = fs.readdirSync(PASTA_UPLOADS); } catch { return; }
  if (!nomes.length) return;
  const linhas = await db.prepare('select arquivo from midias').all();
  const vivos = new Set(linhas.map(l => l.arquivo));
  for (const nome of nomes) {
    if (vivos.has(nome)) continue;
    try { fs.unlinkSync(path.join(PASTA_UPLOADS, nome)); } catch { /* já sumiu */ }
  }
}

async function vistoriaDaSessao(id, usuarioId) {
  const linha = await db.prepare('select user_id from inspections where id = ?').get(id);
  return !!(linha && linha.user_id === usuarioId);
}

router.post('/', limiteUpload, corpoCru, async (req, res) => {
  await varrer();

  const meta = TIPOS[req.query.tipo];
  if (!meta) return res.status(400).json({ erro: 'Tipo de mídia inválido.' });

  const ambiente = Number(req.query.ambiente);
  if (!Number.isInteger(ambiente) || ambiente < 0) {
    return res.status(400).json({ erro: 'Ambiente inválido.' });
  }

  const vistoria = String(req.query.vistoria || '');
  if (!(await vistoriaDaSessao(vistoria, req.usuario.id))) {
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

  const { n } = await db.prepare(
    'select count(*)::int n from midias where inspection_id = ? and ambiente = ? and tipo = ?'
  ).get(vistoria, ambiente, req.query.tipo);
  if (n >= meta.max) {
    return res.status(409).json({ erro: `Limite de ${meta.max} por ambiente atingido.` });
  }

  const id = crypto.randomUUID();
  const arquivo = `${id}.${ext}`;
  const criado = new Date().toISOString();
  fs.writeFileSync(path.join(PASTA_UPLOADS, arquivo), req.body);

  await db.prepare(`
    insert into midias (id, user_id, inspection_id, ambiente, tipo, mime, bytes, arquivo, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.usuario.id, vistoria, ambiente, req.query.tipo, mime, req.body.length, arquivo, criado);

  res.status(201).json({
    id, ambiente, tipo: req.query.tipo, mime, bytes: req.body.length, created_at: criado
  });
});

router.get('/', async (req, res) => {
  await varrer();
  const linhas = await db.prepare(`
    select id, ambiente, tipo, mime, bytes, created_at
      from midias
     where inspection_id = ? and user_id = ?
     order by ambiente, created_at
  `).all(String(req.query.vistoria || ''), req.usuario.id);
  res.json(linhas);
});

router.post('/reindexar', express.json(), async (req, res) => {
  const { vistoria, removido } = req.body || {};
  const i = Number(removido);
  if (!Number.isInteger(i) || i < 0) return res.status(400).json({ erro: 'Ambiente inválido.' });
  if (!(await vistoriaDaSessao(String(vistoria || ''), req.usuario.id))) {
    return res.status(404).json({ erro: 'Vistoria não encontrada.' });
  }

  const doRemovido = await db.prepare(
    'select arquivo from midias where inspection_id = ? and user_id = ? and ambiente = ?'
  ).all(vistoria, req.usuario.id, i);

  await db.prepare('delete from midias where inspection_id = ? and user_id = ? and ambiente = ?')
    .run(vistoria, req.usuario.id, i);
  await db.prepare('update midias set ambiente = ambiente - 1 where inspection_id = ? and user_id = ? and ambiente > ?')
    .run(vistoria, req.usuario.id, i);

  for (const m of doRemovido) {
    try { fs.unlinkSync(path.join(PASTA_UPLOADS, m.arquivo)); } catch { /* já sumiu */ }
  }
  res.json({ ok: true });
});

router.get('/:id/arquivo', async (req, res) => {
  const m = await db.prepare('select arquivo, mime from midias where id = ? and user_id = ?')
    .get(req.params.id, req.usuario.id);
  if (!m) return res.status(404).json({ erro: 'Mídia não encontrada.' });

  res.setHeader('Content-Type', m.mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.join(PASTA_UPLOADS, m.arquivo), (err) => {
    if (err && !res.headersSent) res.status(404).json({ erro: 'Arquivo indisponível.' });
  });
});

router.delete('/:id', async (req, res) => {
  const m = await db.prepare('select arquivo from midias where id = ? and user_id = ?')
    .get(req.params.id, req.usuario.id);
  if (!m) return res.status(404).json({ erro: 'Mídia não encontrada.' });

  await db.prepare('delete from midias where id = ? and user_id = ?').run(req.params.id, req.usuario.id);
  try { fs.unlinkSync(path.join(PASTA_UPLOADS, m.arquivo)); } catch { /* já sumiu */ }
  res.json({ ok: true });
});
```

- [ ] **Step 2: `server/servidor.test.js` — `await` na seção de mídia**

```js
test('apagar a vistoria leva as midias junto (cascata)', async () => {
  const { db, PASTA_UPLOADS } = require('./db');
  assert.ok(fs.existsSync(PASTA_UPLOADS), 'a pasta de uploads nasce com o servidor');

  await A('PUT', '/api/inspections/v-cascata', { id: 'v-cascata', tipo: 'Entrada', rooms: [] });
  const dono = (await A('GET', '/api/auth/sessao')).dados.user.id;
  await db.prepare(`insert into midias (id, user_id, inspection_id, ambiente, tipo, mime, bytes, arquivo, created_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('m-cascata', dono, 'v-cascata', 0, 'foto', 'image/jpeg', 10, 'm-cascata.jpg', new Date().toISOString());

  const { n: antes } = await db.prepare('select count(*)::int n from midias').get();
  assert.strictEqual(antes, 1);
  assert.strictEqual((await A('DELETE', '/api/inspections/v-cascata')).status, 200);
  const { n: depois } = await db.prepare('select count(*)::int n from midias').get();
  assert.strictEqual(depois, 0, 'a linha de midia nao pode sobreviver a vistoria que ela documenta');
});
```

```js
test('apagar a midia leva o arquivo do disco junto', async () => {
  const { db, PASTA_UPLOADS } = require('./db');
  const id = (await A('GET', '/api/midias?vistoria=v1')).dados[0].id;
  const arquivo = (await db.prepare('select arquivo from midias where id = ?').get(id)).arquivo;
  assert.ok(fs.existsSync(path.join(PASTA_UPLOADS, arquivo)));

  assert.strictEqual((await B('DELETE', '/api/midias/' + id)).status, 404, 'B nao apaga midia de A');
  assert.strictEqual((await A('DELETE', '/api/midias/' + id)).status, 200);

  assert.strictEqual(fs.existsSync(path.join(PASTA_UPLOADS, arquivo)), false,
    'linha apagada sem arquivo apagado e lixo que ninguem mais alcanca');
});
```

- [ ] **Step 3: Rodar a fatia de mídia**

Run: `node --no-warnings=ExperimentalWarning --test --test-name-pattern="midia|ambiente|orfao|arquivo|foto|video|teto|quantidade" server/servidor.test.js`
Expected: passam.

- [ ] **Step 4: Commit**

```bash
git add server/rotas/midias.js server/servidor.test.js
git commit -m "feat(supabase): midia da vistoria assincrona"
```

---

### Task 6: Perfil e Admin assíncronos

**Files:**
- Modify: `server/rotas/perfil.js`
- Modify: `server/rotas/admin.js`

**Interfaces:**
- Consumes: `db.prepare` async, `exigirLogin`/`exigirAdmin`.
- Produces: nada consumido por outro arquivo.

- [ ] **Step 1: `server/rotas/perfil.js`**

```js
router.get('/', async (req, res) => {
  const linha = await db
    .prepare('select profile_data from profiles where id = ?')
    .get(req.usuario.id);

  let dados = {};
  try {
    if (linha) {
      dados = typeof linha.profile_data === 'string'
        ? JSON.parse(linha.profile_data)
        : linha.profile_data;
    }
  } catch {
    // Perfil corrompido não pode impedir o login. Volta vazio; a próxima
    // gravação o substitui.
  }
  res.json(dados || {});
});

router.put('/', async (req, res) => {
  const dados = req.body && typeof req.body === 'object' ? req.body : {};
  await db.prepare(`
    insert into profiles (id, profile_data, updated_at) values (?, ?, ?)
    on conflict(id) do update set profile_data = excluded.profile_data,
                                  updated_at   = excluded.updated_at
  `).run(req.usuario.id, JSON.stringify(dados), new Date().toISOString());
  res.json({ ok: true });
});
```

(`linha.profile_data` recebe o mesmo tratamento "string ou já objeto" que `paraFora` usa — `profiles` não passa pelo `paraFora` porque fica fora do mapa `RECURSOS`, então a checagem de tipo é feita aqui, localmente.)

- [ ] **Step 2: `server/rotas/admin.js`**

```js
router.get('/contracts', async (req, res) => {
  const linhas = await db.prepare(`
    select id, user_id, name, template_id, fields, is_finalized,
           created_at, updated_at
      from contracts
  `).all();

  res.json(linhas.map(l => {
    let fields = {};
    try {
      fields = typeof l.fields === 'string' ? JSON.parse(l.fields) : (l.fields || {});
    } catch { /* contrato corrompido não derruba a lista */ }
    return { ...l, fields, is_finalized: !!l.is_finalized };
  }));
});

router.get('/profiles', async (req, res) => {
  const linhas = await db.prepare('select id, profile_data from profiles').all();
  res.json(linhas.map(l => {
    let profile_data = {};
    try {
      profile_data = typeof l.profile_data === 'string' ? JSON.parse(l.profile_data) : (l.profile_data || {});
    } catch { /* idem */ }
    return { id: l.id, profile_data };
  }));
});

router.get('/users', async (req, res) => {
  const linhas = await db.prepare(`
    select id, email, criado_em, ultimo_login, is_admin from users
  `).all();

  res.json(linhas.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.criado_em,
    last_sign_in_at: u.ultimo_login,
    is_admin: !!u.is_admin
  })));
});
```

- [ ] **Step 3: `server/servidor.test.js` — `await` nos dois asserts finais da conta**

```js
test('excluir conta exige a senha certa e leva os dados junto', async () => {
  const c = cliente();
  await c('POST', '/api/auth/registrar', { email: 'sai@teste.com', senha: 'segredo123' });
  await c('PUT', '/api/properties/p-sai', { id: 'p-sai', name: 'Imovel', address: 'Rua X' });

  assert.strictEqual((await c('DELETE', '/api/auth/conta', { senha: 'errada' })).status, 401);
  assert.strictEqual((await c('GET', '/api/properties')).dados.length, 1, 'nada foi apagado');

  assert.strictEqual((await c('DELETE', '/api/auth/conta', { senha: 'segredo123' })).status, 200);

  const { db } = require('./db');
  assert.strictEqual((await db.prepare('select count(*)::int n from users where email = ?').get('sai@teste.com')).n, 0);
  assert.strictEqual((await db.prepare('select count(*)::int n from properties where id = ?').get('p-sai')).n, 0,
    'on delete cascade leva o ERP junto');
});
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: **todos os 59 testes de backend + todos os testes de front passam.** Se algo falhar, é sinal de um `await` esquecido ou um `count(*)` sem `::int` que passou despercebido em alguma task anterior — corrija aqui antes de prosseguir.

- [ ] **Step 5: Commit**

```bash
git add server/rotas/perfil.js server/rotas/admin.js server/servidor.test.js
git commit -m "feat(supabase): perfil e admin assincronos — suite completa passa contra Postgres"
```

---

### Task 7: CI — Postgres efêmero no GitHub Actions

**Files:**
- Modify: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: nada do código; consome a imagem `postgres:17` do Docker Hub.
- Produces: `DATABASE_URL` disponível para o job de teste, apontando para o container do CI — **não** para a Supabase real.

**Por que um Postgres à parte, e não a Supabase real:** rodar CI contra o projeto de produção faria todo push criar/apagar um esquema no banco de verdade, e consumiria a cota de conexões da Supabase a cada execução. Um container efêmero do próprio Actions é hermético, gratuito e não deixa resíduo.

- [ ] **Step 1: Adicionar o serviço e a variável**

Substituir `.github/workflows/test.yml` por:

```yaml
name: testes

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      # Postgres efêmero do próprio Actions — não é a Supabase real. Cada
      # execução sobe um banco vazio e o descarta ao fim do job.
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Verificar localmente que a variável de ambiente (sem `.env`) também funciona**

Run: `DATABASE_URL="$(grep DATABASE_URL .env | cut -d= -f2-)" env -u PG_SCHEMA node -e "delete require.cache; process.env.DATABASE_URL=process.env.DATABASE_URL; require('./server/db').pronto.then(()=>{console.log('ok, sem depender do .env'); process.exit(0)})"`
Expected: imprime `ok, sem depender do .env` — prova que `server/env.js` não sobrescreve uma `DATABASE_URL` já definida no ambiente, que é exatamente o que o CI vai fazer.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: Postgres efemero no GitHub Actions para os testes de backend"
```

Depois do push, conferir a aba Actions do repositório e confirmar que o job passou.

---

### Task 8: Migrar os dados de `data.db` para a Supabase

**Files:**
- Create: `server/migrar-para-supabase.js`

**Interfaces:**
- Consumes: `node:sqlite` (para ler `data.db`), `pg` (para escrever no Postgres).
- Produces: nada — script de execução única, roda uma vez e não faz parte da suíte nem do boot do servidor.

**Escopo confirmado antes deste plano:** 1 conta, 1 perfil, 4 contratos, 1 imóvel, 2 clientes, 0 lançamentos financeiros, 0 vistorias, 0 mídias, 4 links do inquilino, 1 sessão (não migra — o dono loga de novo depois do corte).

- [ ] **Step 1: Escrever o script**

Criar `server/migrar-para-supabase.js`:

```js
// Migração única: copia data.db (SQLite) para o Postgres da Supabase.
// Rodar DEPOIS da Task 6 (schema já existe no Postgres) e com o servidor
// PARADO: node server/migrar-para-supabase.js
//
// Preserva todos os IDs — inclusive user_id — porque esta fase NÃO troca o
// mecanismo de login (continua scrypt + cookie, não Auth da Supabase). A
// remontagem de user_id só entra na Fase 3, se e quando o Auth mudar de fato.
//
// `sessions` fica de fora de propósito: token de sessão não tem valor depois
// de trocar de banco, e o dono loga de novo uma vez após o corte.
require('./env');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { Pool } = require('pg');

const ARQUIVO_SQLITE = process.argv[2] || path.join(__dirname, '..', 'data.db');
const sqlite = new DatabaseSync(ARQUIVO_SQLITE, { readOnly: true });

const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Ordem que respeita as FKs: users primeiro; midias por último (depende de
// inspections E users).
const TABELAS = [
  { nome: 'users', colunas: ['id', 'email', 'senha_hash', 'salt', 'is_admin', 'criado_em', 'ultimo_login'] },
  { nome: 'profiles', colunas: ['id', 'profile_data', 'updated_at'] },
  { nome: 'contracts', colunas: ['id', 'user_id', 'name', 'template_id', 'fields', 'is_finalized', 'cloud_id', 'cloud_key', 'created_at', 'updated_at'] },
  { nome: 'properties', colunas: ['id', 'user_id', 'name', 'address', 'cep', 'type', 'bedrooms', 'bathrooms', 'parking', 'area', 'rent_value', 'iptu_value', 'condo_value', 'status', 'notes', 'created_at', 'updated_at'] },
  { nome: 'clients', colunas: ['id', 'user_id', 'name', 'client_type', 'person_type', 'document', 'rg', 'phone', 'email', 'address', 'profession', 'income', 'notes', 'created_at', 'updated_at'] },
  { nome: 'financial_records', colunas: ['id', 'user_id', 'contract_id', 'description', 'tenant_name', 'landlord_name', 'due_date', 'rent_value', 'fee_percent', 'fee_value', 'net_payout', 'status', 'paid_at', 'notes', 'created_at', 'updated_at'] },
  { nome: 'inspections', colunas: ['id', 'user_id', 'property_id', 'contract_id', 'tipo', 'status', 'tenant_name', 'inspected_on', 'notes', 'rooms', 'closed_at', 'created_at', 'updated_at'] },
  { nome: 'tenant_links', colunas: ['id', 'encrypted_payload', 'key_proof', 'finalized', 'finalized_at', 'finalized_ip', 'created_by', 'created_at', 'expires_at'] },
  { nome: 'midias', colunas: ['id', 'user_id', 'inspection_id', 'ambiente', 'tipo', 'mime', 'bytes', 'arquivo', 'created_at'] }
];

// jsonb precisa da MESMA regra de borda do db.js: sempre string indo para
// dentro, porque o driver não stringifica objeto/array sozinho.
const COLUNAS_JSON = { contracts: ['fields'], profiles: ['profile_data'], inspections: ['rooms'] };

async function migrarTabela({ nome, colunas }) {
  const linhas = sqlite.prepare(`select ${colunas.join(', ')} from ${nome}`).all();
  if (!linhas.length) {
    console.log(`${nome}: 0 linhas, nada a copiar`);
    return 0;
  }

  const jsonCols = COLUNAS_JSON[nome] || [];
  const marcas = colunas.map((_, i) => `$${i + 1}`).join(', ');

  for (const linha of linhas) {
    const valores = colunas.map(c => {
      const v = linha[c];
      if (jsonCols.includes(c)) return typeof v === 'string' ? v : JSON.stringify(v ?? {});
      return v;
    });
    await pg.query(
      `insert into ${nome} (${colunas.join(', ')}) values (${marcas}) on conflict (id) do nothing`,
      valores
    );
  }
  console.log(`${nome}: ${linhas.length} linhas copiadas`);
  return linhas.length;
}

(async () => {
  let total = 0;
  for (const t of TABELAS) total += await migrarTabela(t);

  console.log(`\nTotal: ${total} linhas. Conferindo contagens...`);
  for (const { nome } of TABELAS) {
    const { rows } = await pg.query(`select count(*)::int as n from ${nome}`);
    const { n: origem } = sqlite.prepare(`select count(*) n from ${nome}`).get();
    const status = rows[0].n >= origem ? 'ok' : 'DIVERGENTE';
    console.log(`  ${nome}: sqlite=${origem} postgres=${rows[0].n} [${status}]`);
  }

  await pg.end();
  sqlite.close();
})();
```

- [ ] **Step 2: Rodar contra o Postgres de verdade**

Com o servidor **parado** (`npm start` não pode estar rodando ao mesmo tempo, para não haver escrita concorrente durante a cópia):

```bash
node --no-warnings=ExperimentalWarning server/migrar-para-supabase.js
```

Expected: uma linha por tabela com a contagem, e `[ok]` em todas — `users: 1`, `profiles: 1`, `contracts: 4`, `properties: 1`, `clients: 2`, `financial_records: 0`, `inspections: 0`, `tenant_links: 4`, `midias: 0`.

- [ ] **Step 3: Confirmar pelo Table Editor da Supabase**

Abrir o painel da Supabase → Table Editor → conferir visualmente que `contracts` tem 4 linhas e que uma delas é o contrato do Allano (campo `fields->>'nome_locatario'`). Este é o passo que fecha o motivo original de todo este trabalho.

- [ ] **Step 4: Renomear o `data.db` antigo como backup local**

```bash
mv data.db "data.db.bak-pre-supabase-$(date +%Y%m%d)"
mv data.db-wal "data.db-wal.bak-pre-supabase-$(date +%Y%m%d)" 2>/dev/null || true
mv data.db-shm "data.db-shm.bak-pre-supabase-$(date +%Y%m%d)" 2>/dev/null || true
```

(Não apagar — é a única cópia do estado pré-migração até a Fase 1 estar validada em uso real por alguns dias.)

- [ ] **Step 5: Commit**

```bash
git add server/migrar-para-supabase.js
git commit -m "feat(supabase): script de migracao dos dados de data.db para o Postgres"
```

---

### Task 9: Documentação — desfazer o que 26/08 registrou

**Files:**
- Modify: `README.md`
- Modify: `docs/ARQUITETURA.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` (campo `description`)

**Por que esta task existe:** a regra de manutenção do próprio `ARQUITETURA.md` ("se uma mudança contraria a Parte II, primeiro se muda este documento") — e a Fase 1 contraria a seção 0.1 inteira, escrita em 26/08.

- [ ] **Step 1: `README.md`**

Na seção "Rodando localmente", trocar a exigência de `node:sqlite` por `DATABASE_URL`, e a tabela de variáveis de ambiente ganha a linha:

```markdown
| `DATABASE_URL` | *(obrigatória)* | Connection string do Postgres (Supabase). Porta 5432 — direta ou "Session pooler", nunca "Transaction pooler" (6543). |
| `PG_SCHEMA` | `public` | Só os testes definem isto, para isolar num esquema descartável. |
```

Remover a frase "o banco (`data.db`) é criado no primeiro boot" e substituir por "o schema é criado no primeiro boot, dentro do Postgres apontado por `DATABASE_URL`". Remover a seção "Backup são duas coisas" (era sobre `data.db` + `uploads/`; `uploads/` continua local até a Fase 2, mas o banco agora tem backup gerenciado pela Supabase — anotar isso).

- [ ] **Step 2: `docs/ARQUITETURA.md` — seção 0.1 reescrita**

Substituir a seção "## 0.1 Backend próprio — decisão de 2026-08-26" inteira por uma nova seção "## 0.2 Volta à Supabase — decisão de 2026-08-28", registrando: o motivo (painel sem terminal), a escolha de manter Auth próprio nesta fase (só o banco migrou), a referência ao spec, e a atualização da tabela de "critérios para reavaliar" (agora "critério para avançar para a Fase 2/3" em vez de "para sair de A para B"). Não apagar a seção antiga — o R9.2 do próprio documento manda registrar quando a linha muda, não reescrever a história; mover o conteúdo de 26/08 para dentro de uma nota "(revertido em 28/08, ver 0.2)".

- [ ] **Step 3: `CHANGELOG.md`**

Entrada do dia (**AAAA-MM-DD** real de quando a task rodar) descrevendo: a decisão, as três armadilhas de tipo encontradas e corrigidas (jsonb invertido, `count(*)` como string, e-mail case-insensitive), o número final de testes, e o resultado da migração de dados (contagens por tabela).

- [ ] **Step 4: `package.json`**

```json
"description": "Geração e gestão de contratos de locação. Front sem build em public/; backend Node+Express+Postgres (Supabase) em server/."
```

- [ ] **Step 5: Rodar a suíte inteira uma última vez**

Run: `npm test`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/ARQUITETURA.md CHANGELOG.md package.json
git commit -m "docs: registrar a volta a Supabase (Fase 1) e desfazer a secao 0.1 de 26/08"
```
