// Check minimo do Dashboard: parser de dinheiro e janela de vencimento.
// Rodar: node js/dashboard.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// dashboard.js e um script de browser (global), nao um modulo: avalia e pega o global.
// Utils vem antes: parseValor delega para Utils.parseMoneyBRL (parser unico).
const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
global.Utils = load('utils.js', 'Utils');
const Dashboard = load('dashboard.js', 'Dashboard');

// parseValor: "R$ 2.450,00" -> 2450 (via Utils.parseMoneyBRL)
assert.strictEqual(Dashboard.parseValor('R$ 2.450,00'), 2450);
assert.strictEqual(Dashboard.parseValor('R$ 1.980,50'), 1980.5);
assert.strictEqual(Dashboard.parseValor(''), 0);
assert.strictEqual(Dashboard.parseValor(undefined), 0);

// countAVencer: so conta termino dentro dos proximos 30 dias
const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const contratos = [
  { fields: { data_termino: emDias(10) } },  // dentro da janela
  { fields: { data_termino: emDias(60) } },  // fora
  { fields: { data_termino: emDias(-5) } },  // ja venceu
  { fields: {} },                            // sem data
];
assert.strictEqual(Dashboard.countAVencer(contratos), 1);

// Receita mensal: SO contratos ativos entram na soma (vencido e futuro ficam fora)
global.Contracts = {};
global.Storage = {
  getStats: () => ({ total: 3, thisMonth: 0 }),
  getAll: () => [
    { id: 'a', fields: { valor_aluguel: 'R$ 1.000,00', data_inicio: emDias(-30), data_termino: emDias(300) } }, // ativo
    { id: 'b', fields: { valor_aluguel: 'R$ 5.000,00', data_inicio: emDias(-400), data_termino: emDias(-10) } }, // vencido
    { id: 'c', fields: { valor_aluguel: 'R$ 7.000,00', data_inicio: emDias(30), data_termino: emDias(400) } },  // a iniciar
  ],
  // O painel redesenhado le mais que contratos; o esboco acompanha.
  getAdminProfile: () => ({ nome_locador: 'Allan de Oliveira' }),
  getFinancialRecords: () => [],
  getProperties: () => [],
  getClients: () => [],
  getContractsForProperty: () => [],
};
// O painel guarda a aba escolhida no localStorage; no node ele nao existe.
global.localStorage = { getItem: () => null, setItem: () => {} };

const container = { innerHTML: '' };
Dashboard.render(container);
assert.ok(container.innerHTML.includes('1.000'), 'receita deve incluir o contrato ativo');
assert.ok(!container.innerHTML.includes('13.000') && !container.innerHTML.includes('12.000'),
  'receita nao pode somar vencidos/futuros');

// ── Fila "Precisa de voce": e derivada, nao um contador solto ────────────
// O vencido e o que vence em 300 dias nao podem cair na mesma cesta, e um
// contrato sem valor tem de aparecer como incompleto -- e o caso que some
// dos numeros sem ninguem notar.
const acoes = Dashboard.acoesPendentes(Storage.getAll());
assert.ok(acoes.some(a => a.tag === 'Vencido'), 'contrato vencido deve entrar na fila');
assert.ok(!acoes.some(a => a.tag === 'Vence em breve'),
  'contrato terminando em 300 dias nao vence "em breve"');
const semValor = Dashboard.acoesPendentes([{ id: 'z', fields: { data_inicio: emDias(-10), data_termino: emDias(200) } }]);
assert.ok(semValor.some(a => a.tag === 'Incompleto'), 'contrato sem aluguel deve ser sinalizado');
// Link gerado e nao devolvido: o contrato esta parado esperando o inquilino.
const esperando = Dashboard.acoesPendentes([
  { id: 'y', cloudId: 'abc', isFinalized: false, fields: { valor_aluguel: 'R$ 1,00', data_inicio: emDias(-10), data_termino: emDias(200) } }
]);
assert.ok(esperando.some(a => a.tag === 'Aguardando inquilino'), 'link pendente deve aparecer na fila');

// A fila sai ordenada por urgencia: vencido antes de "vence em breve".
const ordem = Dashboard.acoesPendentes([
  { id: 'v1', fields: { valor_aluguel: 'R$ 1,00', data_inicio: emDias(-400), data_termino: emDias(-5) } },
  { id: 'v2', fields: { valor_aluguel: 'R$ 1,00', data_inicio: emDias(-30), data_termino: emDias(10) } },
]);
assert.strictEqual(ordem[0].tag, 'Vencido', 'o vencido vem primeiro');

// diasAteFim: sem data e diferente de zero dias.
assert.strictEqual(Dashboard.diasAteFim({ fields: {} }), null, 'sem data nao vira 0 dias');

console.log('ok — dashboard: parseValor + countAVencer + receita so de ativos + fila do dia');
