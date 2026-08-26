// Check do SuperAdmin: agrupamento por conta e guard de acesso.
// Rodar: node js/superadmin.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
const Utils = load('utils.js', 'Utils');
global.Utils = Utils;
global.App = { user: null };
// Sem global.Dashboard de propósito: superadmin usa Utils.parseMoneyBRL direto —
// se alguém reintroduzir a dependência da view, este teste quebra.
const SuperAdmin = load('superadmin.js', 'SuperAdmin');

const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── groupAccounts: separa as ilhas e calcula os numeros de cada uma ──
const contracts = [
  { user_id: 'A', name: 'C1', updated_at: '2026-07-01T10:00:00Z',
    fields: { valor_aluguel: 'R$ 1.000,00', data_inicio: emDias(-30), data_termino: emDias(300) } },  // ativo
  { user_id: 'A', name: 'C2', updated_at: '2026-07-20T10:00:00Z',
    fields: { valor_aluguel: 'R$ 5.000,00', data_inicio: emDias(-400), data_termino: emDias(-10) } }, // vencido
  { user_id: 'B', name: 'C3', updated_at: '2026-07-10T10:00:00Z',
    fields: { valor_aluguel: 'R$ 7.000,00', data_inicio: emDias(30), data_termino: emDias(400) } },   // a iniciar
];
const profiles = [
  { id: 'A', profile_data: { nome_locador: 'Theo Brandini', doc_locador: '12345678909' } },
  { id: 'C', profile_data: { nome_locador: 'Conta Vazia' } },  // perfil sem contratos
];
const users = [
  { id: 'A', email: 'theo@ex.com', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-07-21T09:00:00Z' },
  { id: 'B', email: 'b@ex.com', created_at: '2026-02-01T00:00:00Z', last_sign_in_at: '2026-07-11T09:00:00Z' },
  { id: 'C', email: 'c@ex.com', created_at: '2026-03-01T00:00:00Z', last_sign_in_at: null },
  { id: 'D', email: 'novo@ex.com', created_at: '2026-06-01T00:00:00Z', last_sign_in_at: '2026-06-02T09:00:00Z' }, // só auth, sem perfil/contrato
];

const contas = SuperAdmin.groupAccounts(contracts, profiles, users);

assert.strictEqual(contas.length, 4, 'A, B, C e D (D existe só no auth)');

const a = contas.find(c => c.userId === 'A');
assert.strictEqual(a.nome, 'Theo Brandini');
assert.strictEqual(a.email, 'theo@ex.com', 'e-mail cruzado do auth');
assert.strictEqual(a.criadoEm, '2026-01-01T00:00:00Z');
assert.strictEqual(a.ultimoLogin, '2026-07-21T09:00:00Z');
assert.strictEqual(a.profile.doc_locador, '12345678909', 'perfil completo disponível para a ficha');
assert.strictEqual(a.total, 2);
assert.strictEqual(a.ativos, 1, 'vencido nao conta como ativo');
assert.strictEqual(a.receita, 1000, 'receita so do ativo (vencido de 5000 fica fora)');
assert.strictEqual(a.ultimaAtividade, '2026-07-20T10:00:00Z');

const b = contas.find(c => c.userId === 'B');
assert.strictEqual(b.nome, '', 'conta sem perfil');
assert.strictEqual(b.email, 'b@ex.com');
assert.strictEqual(b.ativos, 0, 'a iniciar nao e ativo');
assert.strictEqual(b.receita, 0);

const d = contas.find(c => c.userId === 'D');
assert.strictEqual(d.total, 0, 'conta recém-criada sem contrato aparece');
assert.strictEqual(d.email, 'novo@ex.com');

// Sem dados de auth (RPC indisponível): ainda agrupa por perfil/contrato
const semUsers = SuperAdmin.groupAccounts(contracts, profiles, []);
assert.strictEqual(semUsers.find(c => c.userId === 'A').email, '', 'sem RPC, e-mail fica vazio');
assert.ok(semUsers.length >= 3);

// Entradas vazias nao explodem
assert.deepStrictEqual(SuperAdmin.groupAccounts([], [], []), []);
assert.deepStrictEqual(SuperAdmin.groupAccounts(null, null, null), []);

// ── isAdmin: so `is_admin === true` vindo do servidor libera ──
// Antes o papel era um claim do JWT da Supabase; agora e coluna da tabela users.
// Continua valendo que isto e SO cosmetico: o servidor reconsulta o banco em
// cada rota de /api/admin e nao confia em nada que o navegador afirme.
global.App.user = null;
assert.strictEqual(SuperAdmin.isAdmin(), false, 'sem login');
global.App.user = { id: 'A', email: 'a@ex.com' };
assert.strictEqual(SuperAdmin.isAdmin(), false, 'sem o campo');
global.App.user = { id: 'A', is_admin: false };
assert.strictEqual(SuperAdmin.isAdmin(), false, 'is_admin falso');
global.App.user = { id: 'A', is_admin: true };
assert.strictEqual(SuperAdmin.isAdmin(), true);
// Comparacao estrita: valor que so PARECE verdadeiro nao autoriza. Sem o
// `=== true`, uma string vinda torta do servidor viraria admin por descuido.
global.App.user = { id: 'A', is_admin: 1 };
assert.strictEqual(SuperAdmin.isAdmin(), false, 'so o booleano true autoriza');
global.App.user = { id: 'A', is_admin: 'sim' };
assert.strictEqual(SuperAdmin.isAdmin(), false, 'string nao autoriza');
// O formato antigo da Supabase nao pode continuar valendo por acidente.
global.App.user = { app_metadata: { role: 'admin' } };
assert.strictEqual(SuperAdmin.isAdmin(), false, 'claim antigo do JWT nao autoriza mais');

console.log('ok — superadmin: groupAccounts + isAdmin');
