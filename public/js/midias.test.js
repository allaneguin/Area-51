// Check das regras de midia: o que pode subir e para que tamanho a foto encolhe.
// Rodar: node js/midias.test.js
//
// Por que so estas duas: captura e upload sao DOM e camera, e nao ha seam
// honesto para isso em Node. As REGRAS, sim — e sao elas que decidem se o
// locador ve "limite atingido" na hora ou um erro do servidor depois de esperar
// o upload de 25 MB num 4G ruim.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const load = (f, name) => new Function(`${fs.readFileSync(path.join(__dirname, f), 'utf8')}; return ${name};`)();
global.Utils = load('utils.js', 'Utils');
const Midias = load('midias.js', 'Midias');

const arq = (tipo, tamanho) => ({ type: tipo, size: tamanho });

// ── Validacao ───────────────────────────────────────────────────────────
assert.strictEqual(Midias.validar('foto', arq('image/jpeg', 500 * 1024), 0), null,
  'foto pequena de tipo aceito passa');
assert.strictEqual(Midias.validar('video', arq('video/webm', 5 * 1024 * 1024), 1), null,
  'segundo video ainda cabe');

assert.match(Midias.validar('foto', arq('application/pdf', 100), 0), /formato/i,
  'PDF nao e foto');
assert.match(Midias.validar('foto', arq('image/jpeg', 9 * 1024 * 1024), 0), /8 MB|limite/i,
  'foto acima do teto e barrada ANTES de subir 9 MB pela rede');
assert.match(Midias.validar('video', arq('video/webm', 26 * 1024 * 1024), 0), /25 MB|limite/i);
assert.match(Midias.validar('foto', arq('image/jpeg', 100), 8), /8/,
  'nono arquivo no mesmo ambiente e barrado');
assert.match(Midias.validar('video', arq('video/webm', 100), 2), /2/);
assert.match(Midias.validar('outro', arq('image/jpeg', 100), 0), /tipo/i);
assert.match(Midias.validar('foto', null, 0), /nenhum arquivo/i);

// Os limites do front tem que ser os MESMOS do servidor: se o front deixar
// passar o que a rota recusa, o locador espera o upload para ouvir nao.
const rotas = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'rotas', 'midias.js'), 'utf8');
assert.ok(rotas.includes('teto: 8 * 1024 * 1024'), 'teto da foto no servidor mudou — alinhe LIMITES.foto.teto');
assert.ok(rotas.includes('teto: 25 * 1024 * 1024'), 'teto do video no servidor mudou — alinhe LIMITES.video.teto');
assert.ok(rotas.includes('max: 8'), 'quantidade de fotos no servidor mudou');
assert.ok(rotas.includes('max: 2'), 'quantidade de videos no servidor mudou');

// ── Reducao da foto ─────────────────────────────────────────────────────
// Foto de celular tem 3-5 MB; reduzida para 1600px na maior dimensao cai para a
// casa das centenas de KB, que e o que faz o upload valer.
assert.deepStrictEqual(Midias.reduzir(4000, 3000, 1600), { largura: 1600, altura: 1200 });
assert.deepStrictEqual(Midias.reduzir(3000, 4000, 1600), { largura: 1200, altura: 1600 });
assert.deepStrictEqual(Midias.reduzir(800, 600, 1600), { largura: 800, altura: 600 },
  'imagem menor que o teto nao e ampliada');

// ── URL do arquivo ──────────────────────────────────────────────────────
// Sempre a rota autenticada, nunca caminho de disco.
assert.strictEqual(Midias.url('abc-123'), '/api/midias/abc-123/arquivo');

// ── A mesma validação serve o imóvel ────────────────────────────────────
// "Limite de 8 fotos por ambiente" num cartão de imóvel não quer dizer nada
// para quem lê: ali não há ambiente nenhum.
assert.match(Midias.validar('foto', arq('image/jpeg', 100), 8, 'imóvel'), /por imóvel/,
  'o limite do imóvel fala em imóvel');
assert.match(Midias.validar('foto', arq('image/jpeg', 100), 8), /por ambiente/,
  'sem dizer onde, continua sendo o ambiente da vistoria');

console.log('ok — midias: limites por tipo, reducao da foto e o mesmo validar para imovel');
