// Check do financeiro: situacao derivada e recorte por mes.
// Rodar: node js/financeiro.test.js
//
// Por que estes casos: "Atrasado" NAO e um valor guardado no banco -- a coluna
// `status` so conhece 'Pendente' e 'Pago'. O atraso e deduzido do vencimento
// contra a data de hoje. Se essa deducao quebrar, a tela mostra tudo como
// pendente e o locador perde justamente a linha que precisava cobrar.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
global.Utils = load('utils.js', 'Utils');
const Financeiro = load('financeiro.js', 'Financeiro');

const dia = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Situacao ────────────────────────────────────────────────────────────
assert.strictEqual(Financeiro.situacao({ status: 'Pago', due_date: dia(-30) }).label, 'Pago',
  'pago continua pago mesmo com vencimento antigo');
assert.strictEqual(Financeiro.situacao({ status: 'Pendente', due_date: dia(-1) }).label, 'Atrasado',
  'pendente vencido ontem e atraso');
assert.strictEqual(Financeiro.situacao({ status: 'Pendente', due_date: dia(5) }).label, 'Pendente',
  'pendente com vencimento a frente nao e atraso');
// Vencimento HOJE ainda esta em dia: o inquilino tem o dia inteiro para pagar.
assert.strictEqual(Financeiro.situacao({ status: 'Pendente', due_date: dia(0) }).label, 'Pendente',
  'vencimento hoje nao pode ser marcado como atrasado');
// Lancamento sem data nao vira atraso por omissao.
assert.strictEqual(Financeiro.situacao({ status: 'Pendente' }).label, 'Pendente',
  'sem vencimento nao ha atraso a declarar');

// A classe da etiqueta acompanha o estado (e uma das que o tokens.test.js cobre).
assert.strictEqual(Financeiro.situacao({ status: 'Pago' }).classe, 'badge-teal');
assert.strictEqual(Financeiro.situacao({ status: 'Pendente', due_date: dia(-3) }).classe, 'badge-red');

// ── Vencimento da cobranca do mes ───────────────────────────────────────
// A geracao de cobrancas cravava dia 10. Cobranca que nasce vencida e pior que
// cobranca nenhuma: ela entra na fila de atraso do locador no mesmo instante.
const venc = (f, m) => Utils.vencimentoDoMes(f, m);

assert.strictEqual(venc({ dia_vencimento: '5', data_inicio: '2026-01-01' }, '2026-08'), '2026-08-05',
  'o dia sai do contrato, nao do 10 cravado');
assert.strictEqual(venc({ data_inicio: '2026-01-01' }, '2026-08'), '2026-08-10',
  'sem dia no contrato, o 10 continua sendo o padrao');
assert.strictEqual(venc({ dia_vencimento: '10', data_inicio: '2026-08-27' }, '2026-08'), '2026-08-27',
  'contrato que comeca dia 27 nao pode vencer dia 10 do mesmo mes');
assert.strictEqual(venc({ dia_vencimento: '31', data_inicio: '2026-01-01' }, '2026-02'), '2026-02-28',
  'dia 31 em mes curto cai no ultimo dia');
assert.strictEqual(venc({ dia_vencimento: '0' }, '2026-08'), '2026-08-10',
  'dia invalido volta para o padrao, nunca gera data quebrada');

// ── Recorte por mes ─────────────────────────────────────────────────────
// doMes filtra por "YYYY-MM" do vencimento e devolve em ordem de data.
global.Storage = {
  getFinancialRecords: () => ([
    { id: 'b', due_date: '2026-08-28', rent_value: '5200', status: 'Pendente' },
    { id: 'a', due_date: '2026-08-10', rent_value: '2450', status: 'Pago' },
    { id: 'c', due_date: '2026-07-10', rent_value: '2450', status: 'Pago' },
    { id: 'd', rent_value: '999', status: 'Pendente' } // sem vencimento: fica de fora
  ])
};
const agosto = Financeiro.doMes('2026-08');
assert.deepStrictEqual(agosto.map(r => r.id), ['a', 'b'], 'so agosto, em ordem de vencimento');
assert.deepStrictEqual(Financeiro.doMes('2026-07').map(r => r.id), ['c'], 'julho traz so o de julho');
assert.deepStrictEqual(Financeiro.doMes('2026-09'), [], 'mes sem lancamento vem vazio');

// A regua de meses inclui os que tem lancamento E o mes corrente -- senao um
// mes recem-aberto nao teria como ser selecionado.
const meses = Financeiro.mesesDisponiveis();
assert.ok(meses.includes('2026-08') && meses.includes('2026-07'), 'meses com lancamento entram');
assert.ok(meses.includes(new Date().toISOString().slice(0, 7)), 'o mes corrente sempre entra');

// ── Rotulo ──────────────────────────────────────────────────────────────
assert.strictEqual(Financeiro.rotuloMes('2026-08'), 'agosto de 2026');
assert.strictEqual(Financeiro.rotuloMes('2026-01'), 'janeiro de 2026');

// ── Somas do mes usam o conversor de reais, nao a mascara de digitacao ──
// rent_value chega do Postgres como string; se cair no parser errado, o
// previsto do mes sai cem vezes menor.
const total = agosto.reduce((s, r) => s + Utils.toReais(r.rent_value), 0);
assert.strictEqual(total, 7650, 'previsto do mes soma 2450 + 5200');

console.log('ok — financeiro: atraso derivado + recorte por mes + somas em reais');
