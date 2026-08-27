// Check da criação de vistoria: de onde vêm o inquilino e os ambientes.
// Rodar: node js/vistorias.test.js
//
// Por que estes casos: a vistoria de SAÍDA só vale pela comparação com a de
// entrada. Se a saída nascer com a lista de ambientes sugerida em vez da lista
// que a entrada realmente registrou, os dois lados deixam de casar e a
// comparação — que é a razão da tela existir — não fecha.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
global.Utils = load('utils.js', 'Utils');
global.App = { user: null };
global.Api = { usuario: null };
// A tela avisa por toast; no teste ele só não pode tocar no DOM que não existe.
const avisos = [];
Utils.toast = (msg) => avisos.push(msg);

const Storage = load('storage.js', 'Storage');
global.Storage = Storage;
const Vistorias = load('vistorias.js', 'Vistorias');

const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

Storage.propertiesCache = [
  { id: 'p1', name: 'Rua dos Garis, 100' },
  { id: 'p2', name: 'Sem contrato' }
];
Storage.contractsCache = [
  { id: 'c1', name: 'Contrato P1', fields: { property_id: 'p1', nome_locatario: 'Allano', data_inicio: emDias(-30), data_termino: emDias(300) } }
];
Storage.inspectionsCache = [];

// ── Entrada ─────────────────────────────────────────────────────────────
const entrada = Vistorias.criar('p1', 'Entrada', '2026-08-27');
assert.strictEqual(entrada.tipo, 'Entrada');
assert.strictEqual(entrada.inspected_on, '2026-08-27', 'a data escolhida no formulário manda');
assert.strictEqual(entrada.tenant_name, 'Allano', 'o inquilino vem do contrato ativo do imóvel');
assert.strictEqual(entrada.contract_id, 'c1', 'a vistoria fica presa ao contrato ativo');
assert.deepStrictEqual(entrada.rooms.map(r => r.nome), Vistorias.AMBIENTES_PADRAO,
  'sem entrada anterior, os ambientes sugeridos sao o ponto de partida');

// Imóvel sem contrato ativo: a vistoria existe do mesmo jeito, sem inquilino.
const semContrato = Vistorias.criar('p2', 'Entrada', '2026-08-27');
assert.strictEqual(semContrato.tenant_name, '');
assert.strictEqual(semContrato.contract_id, null);

// ── Saída ───────────────────────────────────────────────────────────────
// Enquanto a entrada é rascunho, ela ainda pode mudar: a saída não herda dela.
const saidaCedo = Vistorias.criar('p1', 'Saída', '2027-08-26');
assert.deepStrictEqual(saidaCedo.rooms.map(r => r.nome), Vistorias.AMBIENTES_PADRAO,
  'entrada em rascunho nao serve de base para a saida');

// Entrada fechada, com a lista que o locador realmente usou.
Storage.saveInspection({
  ...entrada, status: 'Fechada',
  rooms: [
    { nome: 'Sala', estado: 'Bom', obs: '' },
    { nome: 'Varanda gourmet', estado: 'Regular', obs: 'churrasqueira trincada' }
  ]
});

const saida = Vistorias.criar('p1', 'Saída', '2027-08-26');
assert.deepStrictEqual(saida.rooms.map(r => r.nome), ['Sala', 'Varanda gourmet'],
  'a saida herda os ambientes da entrada fechada — sem isso nao ha o que comparar');
assert.deepStrictEqual(saida.rooms.map(r => r.estado), ['Bom', 'Bom'],
  'estado e observacao NAO vem juntos: sao o que a saida vai constatar');
assert.strictEqual(saida.rooms[1].obs, '');

// A entrada seguinte no mesmo imóvel volta aos sugeridos: herdar é regra da saída.
const entrada2 = Vistorias.criar('p1', 'Entrada', '2027-09-01');
assert.deepStrictEqual(entrada2.rooms.map(r => r.nome), Vistorias.AMBIENTES_PADRAO);

// ── Imóvel que não existe ───────────────────────────────────────────────
const antes = Storage.getInspections().length;
assert.strictEqual(Vistorias.criar('nao-existe', 'Entrada', '2026-08-27'), null);
assert.strictEqual(Storage.getInspections().length, antes, 'nada foi gravado');
assert.ok(avisos.some(m => /Imóvel não encontrado/.test(m)), 'e o locador foi avisado');

console.log('ok — vistorias: inquilino do contrato ativo + saida herda os ambientes da entrada');
