// Check do painel "Ver" do modelo: as cláusulas e os campos que ele vai pedir.
// Hoje o cartão dá duas linhas de resumo e o locador escolhe no escuro.
// Rodar: node js/templates.test.js
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
global.Contracts = load('../data/contracts.js', 'Contracts');
const Templates = load('templates.js', 'Templates');

Storage.contractsCache = [
  { id: 'c1', templateId: 'locacao_residencial', name: 'Um contrato' },
];

const painel = Templates.detalhe('locacao_residencial');

// O motivo do painel: dá para LER o contrato antes de escolher o modelo.
assert.match(painel, /LOCA[ÇC][ÃA]O/i, 'o texto das cláusulas aparece');
assert.ok(painel.includes('GARANTIA LOCATÍCIA'), 'uma cláusula conhecida do modelo residencial está lá');

// E quais campos ele vai pedir, agrupados como no formulário.
assert.ok(painel.includes('Locador'), 'a seção Locador aparece');
assert.ok(painel.includes('Nome do Locatário'), 'o rótulo de um campo aparece');

// O resumo que o cartão já dava, no mesmo lugar.
assert.ok(painel.includes('Residencial'), 'a categoria aparece');
assert.ok(painel.includes('1 contrato'), 'quantos contratos saíram deste modelo');

// Modelo que não existe não pode estourar a tela.
assert.strictEqual(Templates.detalhe('nao-existe'), '', 'id desconhecido devolve vazio');

// Modelo sem uso diz isso, em vez de mostrar "0 contratos".
Storage.contractsCache = [];
assert.match(Templates.detalhe('locacao_comercial'), /ainda n[ãa]o usado/i,
  'modelo sem uso fala a mesma língua do cartão');

console.log('ok — templates: painel com as cláusulas, os campos por seção e os usos');
