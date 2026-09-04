// ═══════════════════════════════════════════════════════
// Banco — node:sqlite, arquivo único.
//
// O schema nasce no boot (`create table if not exists`). Não há sistema de
// migration: com um arquivo local e sem dado em produção, migration é
// cerimônia. Quando houver banco que não se pode recriar, isto muda.
//
// A parte que importa deste arquivo é o mapa RECURSOS: ele descreve as tabelas
// que o app acessa por CRUD genérico, e é a ÚNICA lista branca de nomes de
// tabela que vira SQL. Rota nenhuma concatena nome vindo do cliente.
// ═══════════════════════════════════════════════════════

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = process.env.DB_FILE || path.join(__dirname, '..', 'data.db');
const db = new DatabaseSync(ARQUIVO);

db.exec('pragma journal_mode = WAL');
db.exec('pragma foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────
db.exec(`
create table if not exists users (
  id          text primary key,
  email       text not null unique collate nocase,
  senha_hash  text not null,
  salt        text not null,
  is_admin    integer not null default 0,
  criado_em   text not null,
  ultimo_login text
);

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
  fields       text not null default '{}',
  is_finalized integer not null default 0,
  cloud_id     text,
  cloud_key    text,
  created_at   text not null,
  updated_at   text not null
);

create table if not exists profiles (
  id           text primary key references users(id) on delete cascade,
  profile_data text not null default '{}',
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
  rooms text not null default '[]',
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

create table if not exists midias_imovel (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  property_id text not null references properties(id) on delete cascade,
  capa        integer not null default 0,
  mime        text not null,
  bytes       integer not null,
  arquivo     text not null,
  created_at  text not null
);
create index if not exists midias_imovel_idx on midias_imovel (property_id, capa desc, created_at);
`);

// ── Pasta dos arquivos de midia ─────────────────────────────────────────
//
// Os bytes ficam em disco, nao no banco: decisao do dono do projeto. O preco
// dela e que o backup passa a ser DUAS coisas (data.db + uploads/) e que a
// cascata do SQLite apaga a linha sem apagar o arquivo — quem recolhe o orfao e
// a varredura em rotas/midias.js.
//
// `midias` e `midias_imovel` de proposito NAO entram no mapa RECURSOS abaixo: o
// CRUD generico grava o que o corpo mandar nas colunas declaradas, e `arquivo` e
// o nome de um arquivo no disco. Nome de arquivo e decisao do servidor, nunca do
// pedido.
//
// Duas tabelas, e nao uma com `inspection_id` anulavel: a foto do imovel vive
// enquanto o imovel existir, a da vistoria morre com a vistoria. Sao dois ciclos
// de vida, e cada um e uma cascata diferente. Juntar os dois exigiria afrouxar o
// NOT NULL de `inspection_id` — que no SQLite significa reconstruir a tabela num
// banco que ja tem contrato assinado dentro. As duas dividem a MESMA pasta de
// arquivos, e e por isso que a varredura de orfao em rotas/midias.js precisa
// olhar as duas: o que ela nao enxerga, ela apaga.
const PASTA_UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(PASTA_UPLOADS, { recursive: true });

// ── Mapa dos recursos com CRUD genérico ─────────────────────────────────
//
// `json`: colunas que o Postgres guardava como jsonb e o PostgREST devolvia
// já parseadas. O SQLite guarda texto. A conversão acontece AQUI, na borda,
// para o front continuar recebendo a forma que sempre recebeu.
//
// `bool`: SQLite não tem boolean. Mesma história, mesma borda.
//
// `profiles` NÃO está aqui de propósito: não tem coluna user_id (a chave
// primária É o usuário) e teria de virar exceção dentro do middleware de
// escopo. Exceção dentro da função que garante o escopo é onde o furo nasce.
// Ela tem rotas próprias em rotas/perfil.js.
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

// Linha do SQLite → forma que o front espera.
// JSON inválido no banco vira `{}`/`[]` em vez de derrubar a listagem inteira:
// um registro corrompido não pode apagar a tela do usuário.
function paraFora(linha, meta) {
  if (!linha) return linha;
  const fora = { ...linha };
  for (const c of meta.json) {
    try {
      fora[c] = JSON.parse(fora[c]);
    } catch {
      fora[c] = (fora[c] || '').trimStart().startsWith('[') ? [] : {};
    }
  }
  for (const c of meta.bool) fora[c] = !!fora[c];
  return fora;
}

// Objeto do front → valores que o SQLite aceita.
// node:sqlite só recebe null/number/string/bigint/Uint8Array: qualquer
// objeto, array ou boolean que passe direto vira TypeError em runtime.
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

module.exports = { db, RECURSOS, paraFora, paraDentro, ARQUIVO, PASTA_UPLOADS };
