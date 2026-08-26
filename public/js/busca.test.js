// Check minimo da busca da barra de conteudo (App.filtrarLista).
// Rodar: node js/busca.test.js
//
// Por que este arquivo existe: a busca e a unica logica NOVA que o redesenho
// de 2026-08-24 trouxe. Ela decide o que o locador ve na lista, e erra em
// silencio -- um item some e ninguem descobre que sumiu por causa do filtro.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── DOM falso, so o que filtrarLista toca ───────────────────────────────
// Nao ha jsdom no projeto (zero dependencias, R1) e nao faz falta: a funcao
// le textContent, escreve .hidden e, no caso vazio, cria UM paragrafo.
function elemento(texto) {
  return { textContent: texto, hidden: false, className: '', id: '' };
}

const itens = [
  elemento('Apartamento Central - Alugado para Maria Silva'),
  elemento('Casa da Praia - Vago'),
  elemento('Sala Comercial - Alugado para Joao Souza'),
];

const criados = [];
const mainContent = {
  innerHTML: '',
  filhos: [],
  appendChild(el) { this.filhos.push(el); criados.push(el); return el; },
};

global.window = { addEventListener() {} };
global.document = {
  getElementById(id) {
    if (id === 'main-content') return mainContent;
    // busca-vazia: devolve o que ja foi criado, como faria o DOM de verdade
    if (id === 'busca-vazia') return criados.find(e => e.id === 'busca-vazia') || null;
    return null;
  },
  querySelectorAll(sel) {
    if (sel === '#main-content [data-busca]') return itens;
    return [];
  },
  createElement() { return elemento(''); },
};

const App = new Function(
  `${fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')}; return App;`
)();
App.container = mainContent;

const visiveis = () => itens.filter(i => !i.hidden).length;

// Termo vazio: nada e escondido.
App.filtrarLista('');
assert.strictEqual(visiveis(), 3, 'busca vazia mostra tudo');

// Casa por trecho do meio, nao so por prefixo.
App.filtrarLista('praia');
assert.strictEqual(visiveis(), 1, 'deve sobrar so a Casa da Praia');
assert.ok(!itens[1].hidden, 'o item que casa nao pode ficar escondido');

// Caixa nao importa.
App.filtrarLista('MARIA');
assert.strictEqual(visiveis(), 1, 'busca deve ignorar maiuscula/minuscula');

// Acento nao importa nos DOIS sentidos: este e o caso que o filtro ingenuo
// erra. Quem digita "joao" tem de achar "Joao", e quem digita "Joao" tambem.
itens[2].textContent = 'Sala Comercial - Alugado para João Souza';
App.filtrarLista('joao');
assert.strictEqual(visiveis(), 1, 'termo sem acento acha texto com acento');
App.filtrarLista('João');
assert.strictEqual(visiveis(), 1, 'termo com acento acha o mesmo item');

// Espaco em volta do termo nao pode zerar a lista.
App.filtrarLista('  praia  ');
assert.strictEqual(visiveis(), 1, 'termo deve ser aparado antes de comparar');

// Sem resultado: some tudo e aparece UM aviso, com o termo escapado por
// textContent (nunca innerHTML -- o termo vem do usuario, R5.4).
App.filtrarLista('xyz-nao-existe');
assert.strictEqual(visiveis(), 0, 'nenhum item casa');
const aviso = criados.find(e => e.id === 'busca-vazia');
assert.ok(aviso, 'deve criar o aviso de lista vazia');
assert.ok(aviso.textContent.includes('xyz-nao-existe'), 'o aviso cita o termo');
assert.strictEqual(aviso.hidden, false, 'o aviso fica visivel');

// Limpar a busca devolve a lista inteira e esconde o aviso -- sem criar um
// segundo paragrafo (era o jeito facil de vazar um aviso por tecla digitada).
App.filtrarLista('');
assert.strictEqual(visiveis(), 3, 'limpar a busca devolve todos os itens');
assert.strictEqual(aviso.hidden, true, 'o aviso some quando ha resultado');
assert.strictEqual(
  criados.filter(e => e.id === 'busca-vazia').length, 1,
  'o aviso e reaproveitado, nunca duplicado'
);

console.log('ok — busca: filtro por trecho, sem acento/caixa, aviso de vazio unico');
