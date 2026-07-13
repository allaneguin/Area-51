// Check minimo do Dashboard: parser de dinheiro e janela de vencimento.
// Rodar: node js/dashboard.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// dashboard.js e um script de browser (global), nao um modulo: avalia e pega o global.
const src = fs.readFileSync(path.join(__dirname, 'dashboard.js'), 'utf8');
const Dashboard = new Function(`${src}; return Dashboard;`)();

// parseValor: "R$ 2.450,00" -> 2450
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

console.log('ok — dashboard: parseValor + countAVencer');
