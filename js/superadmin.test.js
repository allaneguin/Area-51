// Check do SuperAdmin: agrupamento por conta e guard de acesso.
// Rodar: node js/superadmin.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
const Utils = load('utils.js', 'Utils');
const Dashboard = load('dashboard.js', 'Dashboard');
global.Utils = Utils;
global.Dashboard = Dashboard;
global.App = { user: null };
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
  { id: 'A', profile_data: { nome_locador: 'Theo Brandini' } },
  { id: 'C', profile_data: { nome_locador: 'Conta Vazia' } },  // perfil sem contratos
];

const contas = SuperAdmin.groupAccounts(contracts, profiles);

assert.strictEqual(contas.length, 3, 'A, B e C');

const a = contas.find(c => c.userId === 'A');
assert.strictEqual(a.nome, 'Theo Brandini');
assert.strictEqual(a.total, 2);
assert.strictEqual(a.ativos, 1, 'vencido nao conta como ativo');
assert.strictEqual(a.receita, 1000, 'receita so do ativo (vencido de 5000 fica fora)');
assert.strictEqual(a.ultimaAtividade, '2026-07-20T10:00:00Z');

const b = contas.find(c => c.userId === 'B');
assert.strictEqual(b.nome, '', 'conta sem perfil');
assert.strictEqual(b.ativos, 0, 'a iniciar nao e ativo');
assert.strictEqual(b.receita, 0);

const c = contas.find(c2 => c2.userId === 'C');
assert.strictEqual(c.total, 0, 'perfil sem contratos aparece zerado');

// Ordenacao: atividade mais recente primeiro (A > B > C sem atividade)
assert.deepStrictEqual(contas.map(x => x.userId), ['A', 'B', 'C']);

// Entradas vazias nao explodem
assert.deepStrictEqual(SuperAdmin.groupAccounts([], []), []);
assert.deepStrictEqual(SuperAdmin.groupAccounts(null, null), []);

// ── isAdmin: so o claim certo no app_metadata libera ──
global.App.user = null;
assert.strictEqual(SuperAdmin.isAdmin(), false, 'sem login');
global.App.user = { app_metadata: {} };
assert.strictEqual(SuperAdmin.isAdmin(), false, 'sem papel');
global.App.user = { app_metadata: { role: 'admin' } };
assert.strictEqual(SuperAdmin.isAdmin(), true);
// user_metadata NAO vale (e editavel pelo proprio usuario)
global.App.user = { app_metadata: {}, user_metadata: { role: 'admin' } };
assert.strictEqual(SuperAdmin.isAdmin(), false, 'user_metadata nao autoriza');

console.log('ok — superadmin: groupAccounts + isAdmin');
