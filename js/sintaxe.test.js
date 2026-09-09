// Check de sintaxe de TODO o JavaScript do projeto.
// Rodar: node js/sintaxe.test.js
//
// Por que isto existe: não há build. Nada compila, nada empacota — um parêntese
// a menos em `editor.js` só aparece quando alguém abre aquela tela no navegador.
// Dez arquivos do front não são carregados por teste nenhum (editor, tenant,
// auth, app, admin, clients, templates, renovacoes, database, api), e são
// justamente os maiores. `node --check` faz o parse sem executar: é o mais
// barato que pega o erro que a ausência de build deixa passar.
//
// Não substitui ESLint — e não é para substituir. ESLint pegaria variável não
// usada e estilo, ao custo de ~100 pacotes transitivos num projeto que tem UMA
// dependência de propósito. Isto pega a classe de erro que quebra a tela.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');

function todosOsJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules') return [];
    const cheio = path.join(dir, e.name);
    if (e.isDirectory()) return todosOsJs(cheio);
    return e.name.endsWith('.js') ? [cheio] : [];
  });
}

const arquivos = [
  ...todosOsJs(path.join(RAIZ, 'server')),
  ...todosOsJs(path.join(RAIZ, 'public'))
];

assert.ok(arquivos.length > 25, 'esperava dezenas de arquivos, achei ' + arquivos.length);

const quebrados = [];
for (const arq of arquivos) {
  try {
    execFileSync(process.execPath, ['--check', arq], { stdio: 'pipe' });
  } catch (e) {
    quebrados.push(path.relative(RAIZ, arq) + ': ' + String(e.stderr).split('\n')[2]);
  }
}

assert.deepStrictEqual(quebrados, [], 'arquivo com erro de sintaxe:\n' + quebrados.join('\n'));

console.log(`ok — sintaxe: ${arquivos.length} arquivos JS passam no parse`);
