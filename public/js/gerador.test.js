// Check do contrato de teste: preenche TODOS os campos dos modelos reais.
// Rodar: node js/gerador.test.js
//
// Por que testar um gerador de dados falsos: ele existe para encurtar o teste
// do fluxo do inquilino, e só serve se o contrato que ele cria já passar na
// porta do `Editor.generateTenantLink` — que recusa gerar link sem valor,
// endereço, início, prazo e dia de vencimento. Um gerador que deixa um desses
// em branco não economiza nada: o link não sai, e a pessoa vai preencher na mão
// do mesmo jeito. Este teste roda contra os MODELOS DE VERDADE, então campo
// novo num modelo que o gerador não saiba preencher aparece aqui.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
const Utils = load('utils.js', 'Utils');
global.Utils = Utils;
global.Contracts = load('../data/contracts.js', 'Contracts');

const modelos = Object.keys(Contracts);
assert.ok(modelos.length >= 3, 'os tres modelos continuam la');

for (const id of modelos) {
  const f = Utils.dadosDeTeste(id);
  const campos = Contracts[id].fields;

  // 1. Nenhum campo fica em branco — é o ponto de "não preencher toda hora".
  campos.forEach(c => {
    assert.ok(f[c.name] !== undefined && f[c.name] !== '',
      `${id}: campo ${c.name} (${c.type}) ficou vazio no contrato de teste`);
  });

  // 2. Select nunca cai no "Selecione..." (value vazio), que não é escolha.
  campos.filter(c => c.type === 'select').forEach(c => {
    const valores = (c.options || []).map(o => o.value);
    assert.ok(valores.includes(f[c.name]), `${id}: ${c.name} recebeu valor fora das opcoes`);
    assert.notStrictEqual(f[c.name], '', `${id}: ${c.name} ficou no placeholder`);
  });

  // 3. A porta do link do inquilino tem que abrir — a MESMA funcao que o editor
  //    chama, nao uma copia da regra aqui dentro.
  assert.deepStrictEqual(Utils.faltamParaOLink(f, Contracts[id]), [],
    `${id}: contrato de teste nao consegue gerar link do inquilino`);

  // 4. Derivados coerentes: é o que o inquilino lê antes de assinar.
  assert.strictEqual(f.data_termino, Utils.calcularDataTermino(f),
    `${id}: termino tem que bater com inicio + prazo`);
  assert.strictEqual(Utils.getContractStatus({ fields: f }).label, 'Ativo',
    `${id}: contrato de teste tem que nascer vigente, senao nao serve para testar nada`);
  if ('valor_extenso' in f) {
    assert.match(f.valor_extenso, /reais/, `${id}: valor por extenso vazio sai no PDF`);
  }
}

// A porta cobra o que o modelo tem, e nada alem disso: a minuta simples nao tem
// campo de dia de vencimento, e exigi-lo travava aquele modelo para sempre.
const simples = Contracts.locacao_simples;
assert.ok(!simples.fields.some(c => c.name === 'dia_vencimento'), 'premissa do caso');
assert.deepStrictEqual(
  Utils.faltamParaOLink({ valor_aluguel: 'R$ 1', end_imovel: 'Rua X', data_inicio: '2026-01-01', prazo_meses: '12' }, simples),
  [], 'modelo sem o campo nao pode ser cobrado por ele');

// E continua cobrando de quem tem: contrato vazio no modelo completo lista tudo.
assert.deepStrictEqual(
  Utils.faltamParaOLink({}, Contracts.locacao_residencial),
  ['Valor do aluguel', 'Endereço do imóvel', 'Data de início', 'Prazo do contrato', 'Dia de vencimento']);

// Modelo que não existe não inventa contrato.
assert.strictEqual(Utils.dadosDeTeste('nao_existe'), null);

// A data por extenso é a mesma fonte que o editor usa no campo de assinatura.
assert.strictEqual(Utils.dataPorExtenso(new Date('2026-08-27T12:00:00')), '27 de agosto de 2026');

// O botão só aparece rodando local — no painel de um locador de verdade, dado
// falso é dado falso.
assert.strictEqual(Utils.ehLocal({ protocol: 'http:', hostname: 'localhost' }), true);
assert.strictEqual(Utils.ehLocal({ protocol: 'file:', hostname: '' }), true);
assert.strictEqual(Utils.ehLocal({ protocol: 'https:', hostname: 'meusimoveis.com.br' }), false);

console.log('ok — gerador: contrato de teste preenche os 3 modelos e passa na porta do link');
