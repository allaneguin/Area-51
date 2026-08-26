// Check dos tokens de tema: todo var(--x) do app tem de existir no index.css.
// Rodar: node js/tokens.test.js
//
// Por que este arquivo existe: `var(--nao-existe)` sem fallback nao "cai para
// o padrao" -- ela invalida a DECLARACAO INTEIRA, e o navegador nao avisa
// nada. Ja aconteceu duas vezes aqui: o `.cliente-resumo` ficou sem borda e
// sem fundo em 10/08 (`--border`/`--bg`), e em 24/08 o campo somente-leitura
// do editor (`--bg`) e o rotulo da assinatura do inquilino (`--text-heading`)
// estavam no mesmo caso. Erro invisivel e o que mais demora a ser achado.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const lerTokens = (src) =>
  new Set([...src.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));

// A fonte da verdade e o index.css (:root + [data-theme="dark"]), por R6.1.
const definidos = lerTokens(fs.readFileSync(path.join(raiz, 'css/index.css'), 'utf8'));
assert.ok(definidos.size > 40, 'index.css deveria definir dezenas de tokens, achou ' + definidos.size);
assert.ok(definidos.has('--primary') && definidos.has('--text-main'), 'tokens basicos ausentes');

// landing.css fica de fora: e outra pagina, outro track de versao e tem os
// tokens proprios dela, escopados em .lp.
const alvos = [
  ...fs.readdirSync(path.join(raiz, 'css'))
    .filter((f) => f.endsWith('.css') && f !== 'landing.css')
    .map((f) => 'css/' + f),
  ...fs.readdirSync(path.join(raiz, 'js'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => 'js/' + f),
  'data/contracts.js',
  'app.html',
];

// Alem do index.css, vale como definicao qualquer `--x:` escrito em qualquer
// arquivo do conjunto -- inclusive `style="--h: 40px"` montado no JS. Essa e a
// forma legitima de passar um valor CALCULADO para o CSS (altura de barra,
// largura de progresso), e nao tem como estar no :root: muda por elemento.
const fontes = alvos.map((rel) => [rel, fs.readFileSync(path.join(raiz, rel), 'utf8')]);
const conhecidos = new Set(definidos);
for (const [, src] of fontes) for (const t of lerTokens(src)) conhecidos.add(t);
// `style="--h:..."` nao casa com o regex de inicio de linha; pega em separado.
for (const [, src] of fontes) {
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:\s*[^;"']/g)) conhecidos.add(m[1]);
}

const ausentes = [];
for (const [rel, src] of fontes) {
  for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
    const token = m[1];
    const temFallback = m[2] === ',';
    if (!conhecidos.has(token)) {
      ausentes.push(rel + ' -> var(' + token + (temFallback ? ', ...fallback' : '') + ')');
    }
  }
}

assert.deepStrictEqual(
  ausentes, [],
  'var() apontando para token que nao existe:\n  ' + ausentes.join('\n  ')
);

// ── Classes de "familia" que o JS monta por interpolacao ────────────────
// `badge-${cor}` e `modelo-icone ${cor}` sao montadas em tempo de execucao a
// partir de dados (data/contracts.js, status do contrato). Se a regra nao
// existe, a etiqueta sai SEM FUNDO -- nao quebra nada, so fica feia, e por
// isso ninguem percebe. Aconteceu com badge-red e badge-purple em 24/08.
const cssTodo = fs.readdirSync(path.join(raiz, 'css'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(raiz, 'css', f), 'utf8'))
  .join(String.fromCharCode(10));

const jsTodo = alvos
  .filter((rel) => rel.endsWith('.js') || rel.endsWith('.html'))
  .map((rel) => fs.readFileSync(path.join(raiz, rel), 'utf8'))
  .join(String.fromCharCode(10));

// So os literais: `badge-${x}` fica de fora porque o valor e dinamico.
const usadas = new Set(
  [...jsTodo.matchAll(/badge-(?!status)([a-z]+)/g)].map((m) => 'badge-' + m[1])
);
// As cores que os modelos declaram tambem viram classe, por interpolacao.
const dados = fs.readFileSync(path.join(raiz, 'data/contracts.js'), 'utf8');
for (const m of dados.matchAll(/color:\s*'([a-z]+)'/g)) usadas.add('badge-' + m[1]);

const semRegra = [...usadas].filter((cls) => !cssTodo.includes('.' + cls)).sort();
assert.deepStrictEqual(semRegra, [], 'classe usada no JS sem regra no CSS: ' + semRegra.join(', '));

console.log('ok — tokens: ' + definidos.size + ' definidos, nenhum var() orfao em ' + alvos.length + ' arquivos');
