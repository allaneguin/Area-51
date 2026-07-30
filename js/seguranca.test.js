// Check da sanitizacao de fronteira: o payload do link e montado por quem tem
// a chave (inclusive o inquilino) e volta para dentro da sessao do locador.
// Rodar: node js/seguranca.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// database.js e script de browser (global), nao modulo: avalia e pega o global.
const src = fs.readFileSync(path.join(__dirname, 'database.js'), 'utf8');
const CloudDB = new Function(`${src}; return CloudDB;`)();

// ── data-URL de imagem legitima passa intacta ──
const pngOk = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const jpgOk = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';
assert.strictEqual(CloudDB._sanitizeValue(pngOk), pngOk, 'PNG legitimo deve passar');
assert.strictEqual(CloudDB._sanitizeValue(jpgOk), jpgOk, 'JPEG legitimo deve passar');

// ── quebra de atributo: o vetor real do ataque ──
assert.strictEqual(
  CloudDB._sanitizeValue('data:image/png;base64,AAAA" onerror="alert(1)'),
  '', 'aspas no meio do base64 devem zerar o campo');
assert.strictEqual(
  CloudDB._sanitizeValue('data:image/png;base64,AAAA"><script>alert(1)</script>'),
  '', 'fechamento de tag deve zerar o campo');

// ── outros esquemas data: nao sao imagem ──
assert.strictEqual(CloudDB._sanitizeValue('data:text/html;base64,PHNjcmlwdD4='), '');
assert.strictEqual(CloudDB._sanitizeValue('data:image/svg+xml;base64,PHN2Zz4='), '',
  'SVG carrega script: fora da lista permitida');

// ── javascript: disfarcado ──
assert.strictEqual(CloudDB._sanitizeValue('javascript:alert(1)'), 'javascript:alert(1)',
  'nao comeca com data:, sai intacto — quem protege esse caso e o escape no sink');

// ── texto comum nao pode ser tocado ──
assert.strictEqual(CloudDB._sanitizeValue('Maria Silva'), 'Maria Silva');
assert.strictEqual(CloudDB._sanitizeValue('R$ 1.500,00'), 'R$ 1.500,00');
assert.strictEqual(CloudDB._sanitizeValue(''), '');
assert.strictEqual(CloudDB._sanitizeValue(42), 42, 'nao-string sai como veio');
assert.strictEqual(CloudDB._sanitizeValue(null), null);

// ── varredura profunda: e assim que o payload real chega ──
const payload = {
  t: 'residencial',
  f: {
    nome_locatario: 'Maria Silva',
    assinatura_locatario: pngOk,
    selfie_locatario: 'data:image/png;base64,XX" onerror="fetch(1)',
    aninhado: { assinatura_locador: 'data:text/html;base64,PHN2Zz4=' }
  }
};
CloudDB._sanitizeDeep(payload);
assert.strictEqual(payload.f.nome_locatario, 'Maria Silva', 'texto preservado');
assert.strictEqual(payload.f.assinatura_locatario, pngOk, 'imagem valida preservada');
assert.strictEqual(payload.f.selfie_locatario, '', 'injecao zerada');
assert.strictEqual(payload.f.aninhado.assinatura_locador, '', 'varre objeto aninhado');

// ── ciclo nao pode travar a varredura ──
const ciclico = { a: {} };
ciclico.a.volta = ciclico;
CloudDB._sanitizeDeep(ciclico); // se estourar a pilha, o teste falha aqui

console.log('ok — seguranca: sanitizacao de fronteira do payload do inquilino');
