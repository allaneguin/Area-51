// Check do prazo personalizado: frase por extenso e resolucao dos meses.
// Rodar: node js/prazo.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// utils.js e um script de browser (global), nao um modulo: avalia e pega o global.
const src = fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8');
const Utils = new Function(`${src}; return Utils;`)();

// prazoPorExtenso: frase que entra no corpo do contrato
assert.strictEqual(Utils.prazoPorExtenso(1, 'meses'), '01 (um) mês');
assert.strictEqual(Utils.prazoPorExtenso(8, 'meses'), '08 (oito) meses');
assert.strictEqual(Utils.prazoPorExtenso(15, 'meses'), '15 (quinze) meses');
assert.strictEqual(Utils.prazoPorExtenso(18, 'meses'), '18 (dezoito) meses');
assert.strictEqual(Utils.prazoPorExtenso(45, 'meses'), '45 (quarenta e cinco) meses');
assert.strictEqual(Utils.prazoPorExtenso('24', 'meses'), '24 (vinte e quatro) meses');

// Em anos: singular e plural corretos
assert.strictEqual(Utils.prazoPorExtenso(1, 'anos'), '01 (um) ano');
assert.strictEqual(Utils.prazoPorExtenso(2, 'anos'), '02 (dois) anos');
assert.strictEqual(Utils.prazoPorExtenso(10, 'anos'), '10 (dez) anos');

// Sem unidade explicita assume meses (nao pode virar "undefined" no contrato)
assert.strictEqual(Utils.prazoPorExtenso(12), '12 (doze) meses');

// Fora do intervalo suportado ou vazio: string vazia
assert.strictEqual(Utils.prazoPorExtenso(0, 'meses'), '');
assert.strictEqual(Utils.prazoPorExtenso(100, 'meses'), '');
assert.strictEqual(Utils.prazoPorExtenso('', 'meses'), '');
assert.strictEqual(Utils.prazoPorExtenso(undefined, 'anos'), '');

// mesesDoContrato: o select manda; "personalizado" cai na quantidade + unidade.
assert.strictEqual(Utils.mesesDoContrato({ prazo_extenso: '30 (trinta) meses (2 anos e meio)' }), 30);
assert.strictEqual(Utils.mesesDoContrato({ prazo_extenso: '06 (seis) meses' }), 6);
// O caso que quebrava antes: 'personalizado' dava NaN e nunca caia no campo digitado.
assert.strictEqual(Utils.mesesDoContrato({ prazo_extenso: 'personalizado', prazo_meses: '18', prazo_unidade: 'meses' }), 18);
// Anos viram meses para o calculo da data de termino
assert.strictEqual(Utils.mesesDoContrato({ prazo_extenso: 'personalizado', prazo_meses: '3', prazo_unidade: 'anos' }), 36);
assert.strictEqual(Utils.mesesDoContrato({ prazo_extenso: 'personalizado', prazo_meses: '1', prazo_unidade: 'anos' }), 12);
// Sem unidade assume meses (locacao_simples usa prazo_meses puro)
assert.strictEqual(Utils.mesesDoContrato({ prazo_meses: '12' }), 12);
assert.strictEqual(Utils.mesesDoContrato({}), 0);
assert.strictEqual(Utils.mesesDoContrato(null), 0);

// calcularDataTermino: mesma conta que o editor faz ao digitar (mes + mes, -1 dia)
assert.strictEqual(Utils.calcularDataTermino({ data_inicio: '2026-06-01', prazo_meses: '12' }), '2027-05-31');
assert.strictEqual(Utils.calcularDataTermino({ data_inicio: '2026-01-01', prazo_extenso: 'personalizado', prazo_meses: '1', prazo_unidade: 'anos' }), '2026-12-31');
assert.strictEqual(Utils.calcularDataTermino({ data_inicio: '2026-06-01' }), null, 'sem prazo nao da pra derivar');
assert.strictEqual(Utils.calcularDataTermino({ prazo_meses: '12' }), null, 'sem data_inicio nao da pra derivar');
assert.strictEqual(Utils.calcularDataTermino(null), null);

// getContractStatus: o bug real por tras do "preciso abrir o contrato pra
// ele virar Ativo" — generateTenantLink so valida mesesDoContrato(f) > 0,
// nunca que data_termino tenha sido de fato escrita (isso so acontecia ao
// disparar o evento de mudanca do campo no editor). Contrato com prazo
// valido mas sem essa gravacao ficava "Pendente" ate alguem reabrir e mexer
// no campo. A funcao agora deriva na hora quando o campo persistido falta.
const emDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const semTerminoPersistido = {
  fields: { data_inicio: emDias(-10), prazo_meses: '12' } // sem data_termino
};
assert.strictEqual(Utils.getContractStatus(semTerminoPersistido).label, 'Ativo',
  'prazo valido sem data_termino persistida deve mostrar Ativo, nao Pendente');

const semPrazoNenhum = { fields: { data_inicio: emDias(-10) } };
assert.strictEqual(Utils.getContractStatus(semPrazoNenhum).label, 'Pendente',
  'sem prazo nenhum, Pendente continua correto');

const comTerminoPersistidoVencido = {
  fields: { data_inicio: emDias(-400), data_termino: emDias(-10), prazo_meses: '12' }
};
assert.strictEqual(Utils.getContractStatus(comTerminoPersistidoVencido).label, 'Vencido',
  'data_termino persistida (mesmo com prazo diferente) continua tendo prioridade');

// isValidCNPJ: checksum de verdade, nao so comprimento
assert.strictEqual(Utils.isValidCNPJ('11.222.333/0001-81'), true);   // valido classico
assert.strictEqual(Utils.isValidCNPJ('11222333000181'), true);       // sem mascara
assert.strictEqual(Utils.isValidCNPJ('11.222.333/0001-82'), false);  // digito errado
assert.strictEqual(Utils.isValidCNPJ('11.111.111/1111-11'), false);  // repetido
assert.strictEqual(Utils.isValidCNPJ('123'), false);
assert.strictEqual(Utils.isValidCNPJ(''), false);
assert.strictEqual(Utils.isValidCNPJ(undefined), false);

// shareBaseUrl: curto em producao (rewrite /c no vercel.json), caminho real local
assert.strictEqual(
  Utils.shareBaseUrl({ protocol: 'https:', hostname: 'meusimoveis.vercel.app', origin: 'https://meusimoveis.vercel.app', href: 'https://meusimoveis.vercel.app/app.html#x' }),
  'https://meusimoveis.vercel.app/c');
assert.strictEqual(
  Utils.shareBaseUrl({ protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:3000', href: 'http://localhost:3000/app.html#x' }),
  'http://localhost:3000/app.html');
assert.strictEqual(
  Utils.shareBaseUrl({ protocol: 'file:', hostname: '', origin: 'null', href: 'file:///C:/x/app.html#tenant' }),
  'file:///C:/x/app.html');

// dadosClienteHTML: evidencia de aceite aparece; sem aceite, nao inventa nada
const comAceite = Utils.dadosClienteHTML({ doc_locatario: '12345678909', aceite_ts: '2026-07-20T14:32:00.000Z', aceite_hash: 'abcdef0123456789' });
assert.ok(comAceite.includes('Aceite do inquilino'));
assert.ok(comAceite.includes('abcdef012345')); // hash encurtado
const semAceite = Utils.dadosClienteHTML({ doc_locatario: '12345678909' });
assert.ok(!semAceite.includes('Aceite'));

// formatDate: data ISO sem hora nao pode voltar um dia em fuso negativo (Brasil).
// Regressao real: "2026-05-28" exibia 27/05/2026 para todo usuario brasileiro.
assert.strictEqual(Utils.formatDate('2026-05-28'), '28/05/2026');
assert.strictEqual(Utils.formatDate('2028-11-27'), '27/11/2028');
assert.strictEqual(Utils.formatDate('2026-01-01'), '01/01/2026');
assert.strictEqual(Utils.formatDate(''), '');
assert.strictEqual(Utils.formatDate(null), '');

console.log('ok — prazo: mesesPorExtenso + resolucao de meses + formatDate');
