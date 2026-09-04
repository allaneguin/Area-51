// Check do vínculo imóvel ↔ contrato: status derivado e contratos por imóvel.
// Rodar: node js/properties.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
const Utils = load('utils.js', 'Utils');
global.Utils = Utils;
global.App = { user: null };
global.Api = { usuario: null };

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

// ── Foto do imóvel: capa e estado vazio ─────────────────────────────────
// A faixa do cartão tem dois estados e nenhum meio-termo: foto quando existe
// capa, inicial quando não existe. Inventar uma imagem de exemplo faria o
// cartão mentir sobre um dado que o usuário não cadastrou.
global.Midias = load('midias.js', 'Midias');

// O cache vive no Storage, junto dos outros: é `clearAll()` que descarta os
// dados do usuário anterior, e um cache fora dele seria o único a sobreviver
// à troca de conta.
Storage.propertyMediaCache = [
  { id: 'm2', property_id: 'p1', capa: false },
  { id: 'm1', property_id: 'p1', capa: true },
];

assert.deepStrictEqual(
  PropertiesView.fotosDe('p1').map(f => f.id), ['m1', 'm2'],
  'a capa vem primeiro, venha o array na ordem que vier do servidor'
);
assert.deepStrictEqual(PropertiesView.fotosDe('p3'), [], 'imóvel sem foto devolve lista vazia');

const comFoto = PropertiesView.capa({ id: 'p1', name: 'Residencial Flores' });
assert.ok(comFoto.includes('/api/midias/m1/arquivo'), 'a faixa mostra a foto marcada como capa');
assert.ok(comFoto.includes('<img'), 'e mostra como imagem de verdade');

const semFoto = PropertiesView.capa({ id: 'p3', name: 'Residencial Flores' });
assert.ok(!semFoto.includes('<img'), 'sem foto não inventa imagem');
assert.ok(semFoto.includes('>R<'), 'sem foto continua a inicial — o estado vazio honesto que já existia');

// XSS pela porta dos fundos: o id vem do servidor, mas a inicial vem do nome
// que o usuário digitou.
const bravo = PropertiesView.capa({ id: 'p9', name: '<img src=x onerror=alert(1)>' });
assert.ok(!bravo.includes('<img'), 'nome com HTML não vira tag na faixa');

// A foto é o dado mais visualmente óbvio de um vazamento entre contas: se o
// cache sobreviver ao logout, B abre Imóveis e vê a casa de A.
Storage.clearAll();
assert.deepStrictEqual(Storage.propertyMediaCache, [],
  'clearAll precisa descartar as fotos dos imóveis também');

// ── O cartão inteiro, montado ───────────────────────────────────────────
// `capa()` e `fotosDe()` passando não provam que o cartão monta: a faixa de
// miniaturas é construída dentro do `map`, e erro ali só aparece renderizando.
Storage.propertiesCache = [
  { id: 'p1', name: 'Residencial Flores, casa 4', address: 'Rua dos Garis', rent_value: 15000, status: 'Disponível' }
];
Storage.propertyMediaCache = [
  { id: 'm1', property_id: 'p1', capa: true },
  { id: 'm2', property_id: 'p1', capa: false },
];
const alvo = { innerHTML: '' };
PropertiesView.render(alvo);

assert.ok(alvo.innerHTML.includes('/api/midias/m1/arquivo'), 'a capa entrou na faixa do cartão');
assert.ok(alvo.innerHTML.includes('/api/midias/m2/arquivo'), 'a segunda foto virou miniatura');
assert.ok(alvo.innerHTML.includes("escolherFoto('p1')"), 'o cartão oferece anexar foto');
assert.ok(alvo.innerHTML.includes("definirCapa('m2')"), 'a foto que não é capa oferece virar capa');
assert.ok(!alvo.innerHTML.includes("definirCapa('m1')"), 'a que já é capa não oferece virar capa de novo');
assert.ok(alvo.innerHTML.includes('id="prop-foto-arquivo"'), 'o seletor de arquivo existe na tela');

// ── Painel "Ver": o que a lista esconde, e o que depende do imóvel ──────
Storage.propertiesCache = [{
  id: 'p1', name: 'Residencial Flores, casa 4', address: 'Rua dos Garis, Cáceres - MT',
  cep: '78200-000', type: 'Residencial', bedrooms: 1, bathrooms: 1, parking: 0, area: 50,
  rent_value: 15000, iptu_value: 120, condo_value: 0, status: 'Disponível',
  notes: 'Portão novo instalado em março'
}];
Storage.contractsCache = [
  { id: 'c1', name: 'Contrato Maria', fields: { property_id: 'p1', nome_locatario: 'Maria Souza', data_inicio: emDias(-30), data_termino: emDias(300) } }
];
Storage.financialRecordsCache = [
  { id: 'f1', contract_id: 'c1', rent_value: 15000, status: 'Pago' },
  { id: 'f2', contract_id: 'c1', rent_value: 15000, status: 'Pendente' },
];
Storage.inspectionsCache = [{ id: 'v1', property_id: 'p1', tipo: 'Entrada', status: 'Fechada', inspected_on: '2026-03-10' }];
Storage.propertyMediaCache = [{ id: 'm1', property_id: 'p1', capa: true }];

const painel = PropertiesView.detalhe('p1');

// O motivo do painel existir: estes quatro não cabem no cartão e hoje só
// aparecem para quem clica em "Editar" — que é arriscar mexer sem querer.
assert.ok(painel.includes('78200-000'), 'o CEP aparece');
assert.ok(painel.includes('Portão novo instalado em março'), 'as observações aparecem');
assert.ok(painel.includes('120,00'), 'o IPTU aparece formatado');
assert.ok(painel.includes('Residencial'), 'o tipo aparece');

// E o que depende do imóvel — a pergunta "posso excluir isso?".
assert.ok(painel.includes('Maria Souza'), 'o inquilino do contrato aparece');
assert.ok(painel.includes('Entrada'), 'a vistoria aparece');
assert.ok(painel.includes('/api/midias/m1/arquivo'), 'a foto aparece');
assert.ok(painel.includes('15.000,00'), 'o recebido soma só o que foi pago');

// Imóvel sem nada vinculado não pode mostrar seção vazia sem explicação.
Storage.propertiesCache.push({ id: 'p2', name: 'Sala 12', address: 'Centro' });
const vazio = PropertiesView.detalhe('p2');
assert.match(vazio, /nenhum contrato|sem contrato/i, 'diz que não há contrato, em vez de deixar o espaço em branco');

// A observação é texto digitado pelo usuário: é por ali que HTML entra.
Storage.propertiesCache.push({ id: 'p9', name: 'Casa', address: 'Rua', notes: '<img src=x onerror=alert(1)>' });
const perigo = PropertiesView.detalhe('p9');
assert.ok(!perigo.includes('<img src=x'), 'observação com HTML não vira tag');

console.log('ok — properties: vínculo imóvel/contrato + status derivado + clearAll + capa do imóvel');
