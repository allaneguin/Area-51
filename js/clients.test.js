// Check do painel "Ver" do cliente: os campos que a tabela esconde e os
// contratos que são dele. Rodar: node js/clients.test.js
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
const ClientsView = load('clients.js', 'ClientsView');

const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

Storage.clientsCache = [{
  id: 'cl1', name: 'Allano Francisco de Olveira', client_type: 'Inquilino', person_type: 'PF',
  document: '02299728104', rg: '1234567 SSP/MT', phone: '(65) 99999-0000', email: 'allano@teste.com',
  address: 'Rua A, 100 - Cáceres', profession: 'Autônomo', income: 3500,
  notes: 'Indicado pelo João da imobiliária'
}];
// O contrato guarda o CPF FORMATADO e o cadastro guarda só dígitos: o vínculo
// tem que casar mesmo assim, senão o painel diz "nenhum contrato" com contrato.
Storage.contractsCache = [
  { id: 'c1', name: 'Locação casa 4', fields: { cpf_locatario: '022.997.281-04', nome_locatario: 'Allano', data_inicio: emDias(-10), data_termino: emDias(300) } },
  { id: 'c2', name: 'De outra pessoa', fields: { cpf_locatario: '111.444.777-35', nome_locatario: 'Outra' } },
];

const painel = ClientsView.detalhe('cl1');

// O motivo do painel existir: a tabela mostra 5 colunas de 13 campos.
assert.ok(painel.includes('1234567 SSP/MT'), 'o RG aparece');
assert.ok(painel.includes('Rua A, 100 - Cáceres'), 'o endereço aparece');
assert.ok(painel.includes('Autônomo'), 'a profissão aparece');
assert.ok(painel.includes('3.500,00'), 'a renda aparece formatada');
assert.ok(painel.includes('Indicado pelo João da imobiliária'), 'as observações aparecem');

// O vínculo, que é a pergunta "posso excluir este cliente?".
assert.ok(painel.includes('Locação casa 4'), 'o contrato dele aparece mesmo com o CPF em formatos diferentes');
assert.ok(!painel.includes('De outra pessoa'), 'contrato de outro CPF não entra no painel dele');

// Cliente sem contrato não pode mostrar uma seção em branco sem explicação.
Storage.clientsCache.push({ id: 'cl2', name: 'Sem contrato', document: '99988877766' });
assert.match(ClientsView.detalhe('cl2'), /nenhum contrato/i,
  'diz que não há contrato em vez de deixar o espaço vazio');

// Observação é texto digitado: é por ali que HTML entra.
Storage.clientsCache.push({ id: 'cl9', name: 'Bravo', document: '1', notes: '<img src=x onerror=alert(1)>' });
assert.ok(!ClientsView.detalhe('cl9').includes('<img src=x'), 'observação com HTML não vira tag');

console.log('ok — clients: painel de detalhe com os campos escondidos e os contratos do CPF');
