// Check da lista branca de ingestao: o payload do link e montado no navegador
// de quem tem a chave (inclusive o inquilino) e volta para dentro do contrato
// do locador. So a secao Locatario, mais a trilha do aceite, podem entrar.
// Rodar: node js/ingestao.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// utils.js e um script de browser (global), nao um modulo: avalia e pega o global.
const src = fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8');
const Utils = new Function(`${src}; return Utils;`)();

// Modelo minimo no formato de data/contracts.js. Utils le o global Contracts.
global.Contracts = {
  residencial: {
    fields: [
      { section: 'Locador', name: 'nome_locador', label: 'Nome', type: 'text' },
      { section: 'Locador', name: 'conta_banco', label: 'Conta', type: 'text' },
      { section: 'Imóvel', name: 'valor_aluguel', label: 'Aluguel', type: 'text' },
      { section: 'Locatário', name: 'nome_locatario', label: 'Nome', type: 'text' },
      { section: 'Locatário', name: 'doc_locatario', label: 'CPF', type: 'text' }
    ]
  }
};

const doLocador = {
  nome_locador: 'Allan',
  conta_banco: '12345-6',
  valor_aluguel: 'R$ 2.450,00',
  assinatura_locador: 'data:image/png;base64,AAAA'
};

const doInquilino = {
  nome_locatario: 'Theo',                              // legitimo: secao Locatario
  doc_locatario: '123.456.789-00',                     // legitimo: secao Locatario
  assinatura_locatario: 'data:image/png;base64,BBBB',  // legitimo: trilha
  selfie_locatario: 'data:image/jpeg;base64,CCCC',     // legitimo: trilha
  aceite_ts: '2026-08-07T12:00:00.000Z',               // legitimo: trilha
  ip_acesso: '200.1.2.3',                              // legitimo: trilha
  conta_banco: '99999-9',                              // ATAQUE: campo do locador
  valor_aluguel: 'R$ 1,00',                            // ATAQUE: campo do imovel
  nome_locador: 'Atacante',                            // ATAQUE: campo do locador
  assinatura_locador: 'data:image/png;base64,XXXX'     // ATAQUE: assinatura alheia
};

const r = Utils.mesclarCamposDoInquilino(doLocador, doInquilino, 'residencial');

// ── o que o inquilino NAO pode tocar ──
assert.strictEqual(r.conta_banco, '12345-6', 'conta do locador NAO pode ser sobrescrita');
assert.strictEqual(r.valor_aluguel, 'R$ 2.450,00', 'valor do aluguel NAO pode ser sobrescrito');
assert.strictEqual(r.nome_locador, 'Allan', 'nome do locador NAO pode ser sobrescrito');
assert.strictEqual(r.assinatura_locador, 'data:image/png;base64,AAAA',
  'assinatura do locador e dele');

// ── o que o inquilino DEVE conseguir preencher ──
assert.strictEqual(r.nome_locatario, 'Theo', 'campo da secao Locatario deve entrar');
assert.strictEqual(r.doc_locatario, '123.456.789-00', 'campo da secao Locatario deve entrar');
assert.strictEqual(r.assinatura_locatario, 'data:image/png;base64,BBBB',
  'assinatura do inquilino deve entrar');
assert.strictEqual(r.selfie_locatario, 'data:image/jpeg;base64,CCCC', 'selfie deve entrar');
assert.strictEqual(r.aceite_ts, '2026-08-07T12:00:00.000Z', 'trilha de aceite deve entrar');
assert.strictEqual(r.ip_acesso, '200.1.2.3', 'trilha de aceite deve entrar');

// ── chave que nao existe no modelo nem na trilha nao entra ──
const r2 = Utils.mesclarCamposDoInquilino({}, { campo_inventado: 'x' }, 'residencial');
assert.strictEqual(r2.campo_inventado, undefined, 'campo fora do modelo nao entra');

// ── modelo desconhecido: nao explode e continua barrando o que e do locador ──
const r3 = Utils.mesclarCamposDoInquilino(doLocador, doInquilino, 'nao_existe');
assert.strictEqual(r3.conta_banco, '12345-6', 'modelo desconhecido: nada do locador muda');
assert.strictEqual(r3.aceite_ts, '2026-08-07T12:00:00.000Z', 'trilha entra mesmo sem modelo');

// ── entradas vazias nao quebram (contrato novo, payload sem campos) ──
assert.deepStrictEqual(Utils.mesclarCamposDoInquilino(null, null, 'residencial'), {});
assert.strictEqual(
  Utils.mesclarCamposDoInquilino({}, { nome_locatario: 'Theo' }, 'residencial').nome_locatario,
  'Theo', 'contrato novo recebe os campos do inquilino');

// ── nao muta o objeto de entrada (o cache local nao pode mudar por efeito colateral) ──
const base = { conta_banco: '12345-6' };
Utils.mesclarCamposDoInquilino(base, { conta_banco: '99999-9', nome_locatario: 'T' }, 'residencial');
assert.strictEqual(base.conta_banco, '12345-6', 'entrada nao pode ser mutada');
assert.strictEqual(base.nome_locatario, undefined, 'entrada nao pode ganhar campo');

// ── carimbo do servidor (003) vence o autodeclarado ──────────────────────
// aceite_ts_servidor / ip_servidor ficam FORA da lista branca de proposito:
// e o que impede o signatario de redigir a propria prova.
const forjado = {
  nome_locatario: 'Theo',
  aceite_ts: '1999-01-01T00:00:00.000Z',          // autodeclarado: entra, mas so vale para a tela
  aceite_ts_servidor: '1999-01-01T00:00:00.000Z', // ATAQUE: tenta forjar o carimbo
  ip_servidor: '8.8.8.8'                          // ATAQUE: tenta forjar o IP
};
const evidencia = { em: '2026-08-07T18:30:00.000Z', ip: '200.9.9.9' };

const rEv = Utils.mesclarCamposDoInquilino({}, forjado, 'residencial', evidencia);
assert.strictEqual(rEv.aceite_ts_servidor, '2026-08-07T18:30:00.000Z',
  'carimbo do servidor tem de vencer o forjado');
assert.strictEqual(rEv.ip_servidor, '200.9.9.9', 'IP do servidor tem de vencer o forjado');
assert.strictEqual(rEv.aceite_ts, '1999-01-01T00:00:00.000Z',
  'o autodeclarado continua entrando (e so isso: o certificado nao o usa)');

// Sem evidencia (link criado antes da 003), o forjado NAO vira carimbo.
const rSemEv = Utils.mesclarCamposDoInquilino({}, forjado, 'residencial', null);
assert.strictEqual(rSemEv.aceite_ts_servidor, undefined,
  'sem carimbo do servidor, o campo fica ausente — o certificado avisa que nao foi registrado');
assert.strictEqual(rSemEv.ip_servidor, undefined, 'idem para o IP');

console.log('ok — ingestao: lista branca + carimbo do servidor vence o autodeclarado');
