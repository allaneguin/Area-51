// Check do vínculo imóvel ↔ contrato: status derivado e contratos por imóvel.
// Rodar: node js/properties.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
const Utils = load('utils.js', 'Utils');
global.Utils = Utils;
global.App = { user: null };
global.supabaseClient = null;

const Storage = load('storage.js', 'Storage');
global.Storage = Storage;
const PropertiesView = load('properties.js', 'PropertiesView');

const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Cenário: imóvel P1 com contrato ATIVO, P2 com contrato VENCIDO, P3 sem contrato
Storage.contractsCache = [
  { id: 'c1', name: 'Ativo P1', fields: { property_id: 'p1', nome_locatario: 'Maria', data_inicio: emDias(-30), data_termino: emDias(300) } },
  { id: 'c2', name: 'Vencido P2', fields: { property_id: 'p2', nome_locatario: 'José', data_inicio: emDias(-400), data_termino: emDias(-10) } },
  { id: 'c3', name: 'Sem vínculo', fields: { nome_locatario: 'Solto' } },
];
Storage.financialRecordsCache = [
  { id: 'f1', contract_id: 'c1', rent_value: 1500, status: 'Pago' },
  { id: 'f2', contract_id: 'c1', rent_value: 1500, status: 'Pendente' }, // pendente NAO conta
  { id: 'f3', contract_id: 'c2', rent_value: 900, status: 'Pago' },
];

// getContractsForProperty
assert.strictEqual(Storage.getContractsForProperty('p1').length, 1);
assert.strictEqual(Storage.getContractsForProperty('p2').length, 1);
assert.strictEqual(Storage.getContractsForProperty('p3').length, 0);
assert.strictEqual(Storage.getContractsForProperty(null).length, 0, 'sem id nao casa com contratos sem vínculo');

// statusReal: contrato ativo manda; sem ativo, vale o status manual
const r1 = PropertiesView.statusReal({ id: 'p1', status: 'Disponível' });
assert.strictEqual(r1.status, 'Alugado', 'contrato ativo torna o imóvel Alugado automaticamente');
assert.strictEqual(r1.contratoAtivo.fields.nome_locatario, 'Maria');

const r2 = PropertiesView.statusReal({ id: 'p2', status: 'Disponível' });
assert.strictEqual(r2.status, 'Disponível', 'contrato vencido devolve o imóvel para Disponível');
assert.strictEqual(r2.contratoAtivo, null);

const r3 = PropertiesView.statusReal({ id: 'p3', status: 'Em Manutenção' });
assert.strictEqual(r3.status, 'Em Manutenção', 'status manual preservado quando não há contrato ativo');

// generateMonthlyCharges: "ativo" é a regra de datas de Utils.getContractStatus —
// contrato vencido ou a iniciar NÃO gera cobrança (a regra antiga própria gerava).
Storage.financialRecordsCache = [];
Storage.contractsCache = [
  { id: 'c1', name: 'Ativo', fields: { nome_locatario: 'Maria', valor_aluguel: 'R$ 1.500,00', data_inicio: emDias(-30), data_termino: emDias(300) } },
  { id: 'c2', name: 'Vencido', isFinalized: true, fields: { nome_locatario: 'José', valor_aluguel: 'R$ 900,00', data_inicio: emDias(-400), data_termino: emDias(-10) } },
  { id: 'c3', name: 'A iniciar', fields: { nome_locatario: 'Ana', valor_aluguel: 'R$ 2.000,00', data_inicio: emDias(30), data_termino: emDias(400) } },
];
assert.strictEqual(Storage.generateMonthlyCharges(), 1, 'só o contrato ativo gera cobrança');
assert.strictEqual(Storage.financialRecordsCache.length, 1);
assert.strictEqual(Storage.financialRecordsCache[0].contract_id, 'c1');
assert.strictEqual(Storage.financialRecordsCache[0].rent_value, 1500);
assert.strictEqual(Storage.generateMonthlyCharges(), 0, 'idempotente dentro do mesmo mês');

// clearAll: troca de conta descarta os CINCO caches (o vazamento era zerar só 2)
Storage.clientsCache = [{ id: 'x' }];
Storage.profileCache = { nome: 'A' };
Storage.clearAll();
assert.deepStrictEqual(
  [Storage.contractsCache, Storage.propertiesCache, Storage.clientsCache, Storage.financialRecordsCache, Storage.profileCache],
  [[], [], [], [], {}],
  'clearAll precisa zerar todos os caches'
);

console.log('ok — properties: vínculo imóvel/contrato + status derivado + clearAll');
