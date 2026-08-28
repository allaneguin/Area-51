// ═══════════════════════════════════════════════════════
// Limite de tentativas — janela fixa, em memória.
//
// Por que não `express-rate-limit`: ele resolveria a contagem, mas os dois
// furos que este arquivo precisa fechar não são de biblioteca, são de DESENHO
// DA CHAVE (agrupar IPv6 por bloco, e limitar por conta além de por IP).
// Pacote nenhum decide isso por você. O que ele daria a mais — store
// compartilhado, janela deslizante — supõe vários processos; este é um, com um
// arquivo de banco. Quando houver mais de um, o Map aqui deixa de bastar.
//
// A CHAVE é `escopo + alvo`, e o escopo vem de quem monta o limite — nunca da
// URL. Se ela entrasse na chave, `/api/links/<uuid>` daria a cada UUID o seu
// próprio orçamento, e a varredura de UUID passaria sem encostar no teto.
// ═══════════════════════════════════════════════════════

const janelas = new Map();

// Um cliente IPv6 não recebe UM endereço: recebe um bloco /64 — 18 quintilhões
// deles. Chavear pelo endereço inteiro é o mesmo que não ter limite: trocar de
// endereço dentro do próprio bloco é uma linha de configuração. Agrupar pelo
// /64 é o que faz o teto valer para a pessoa, e não para o endereço.
//
// De quebra resolve o crescimento do Map: sem isto, rotação de IPv6 cria uma
// entrada nova por tentativa.
function normalizarIp(ip) {
  const limpo = String(ip || '').replace(/^::ffff:/i, '').trim();
  if (!limpo || !limpo.includes(':')) return limpo;   // IPv4 ou vazio

  // Expande a forma comprimida (`::`) antes de cortar, senão `2001:db8::1` e
  // `2001:db8:0:0:0:0:0:1` — o mesmo endereço — virariam chaves diferentes.
  let grupos;
  if (limpo.includes('::')) {
    const [esq, dir] = limpo.split('::');
    const a = esq ? esq.split(':') : [];
    const b = dir ? dir.split(':') : [];
    const faltam = Math.max(0, 8 - a.length - b.length);
    grupos = [...a, ...Array(faltam).fill('0'), ...b];
  } else {
    grupos = limpo.split(':');
  }

  return grupos.slice(0, 4)
    .map(g => (g || '0').replace(/^0+(?=.)/, '').toLowerCase())
    .join(':') + '::/64';
}

// Janela fixa, não deslizante: o pior caso é o dobro do teto na virada (5 no
// fim de uma janela, 5 no começo da seguinte). Para força bruta de senha isso é
// irrelevante — 10 por minuto continua inviável — e a deslizante custaria
// guardar o carimbo de cada tentativa.
function bater(chave, janelaMs, incrementa) {
  const agora = Date.now();

  // Faxina preguiçosa, na escrita: mesma ideia do `expurgar()` dos links —
  // estrutura lida o tempo todo não precisa de agendador para encolher.
  if (janelas.size > 5000) {
    for (const [k, v] of janelas) if (v.ate <= agora) janelas.delete(k);
  }

  let janela = janelas.get(chave);
  if (!janela || janela.ate <= agora) {
    janela = { n: 0, ate: agora + janelaMs };
    janelas.set(chave, janela);
  }
  if (incrementa) janela.n++;
  return { n: janela.n, segundos: Math.max(1, Math.ceil((janela.ate - agora) / 1000)) };
}

// Middleware. `chave` extrai o alvo do pedido; o padrão é o bloco do IP.
function limitar({ escopo, max, janelaMs, mensagem, chave }) {
  const alvoDe = chave || (req => normalizarIp(req.ip || req.socket.remoteAddress));
  return function (req, res, next) {
    const { n, segundos } = bater(escopo + '|' + alvoDe(req), janelaMs, true);
    if (n > max) {
      res.setHeader('Retry-After', String(segundos));
      return res.status(429).json({
        erro: mensagem || `Muitas tentativas. Tente de novo em ${segundos} segundos.`
      });
    }
    next();
  };
}

// ── Contagem por CONTA, para o login ────────────────────────────────────
//
// O limite por IP protege a PORTA, não a conta: mil endereços fazem cinco
// tentativas cada e nenhum encosta no teto — cinco mil por minuto contra a
// mesma senha. Quem protege a conta é um contador chaveado pelo e-mail.
//
// Conta só o que FALHA, e o acerto zera. Contar acerto junto criaria um jeito
// barato de trancar a conta de alguém de fora: bastaria queimar as tentativas
// no e-mail dela.
const FALHAS = { escopo: 'login-falhas', max: 20, janelaMs: 60 * 60_000 };

function contaBloqueada(email) {
  const chave = FALHAS.escopo + '|' + String(email || '').toLowerCase();
  return bater(chave, FALHAS.janelaMs, false).n >= FALHAS.max;
}

function registrarFalhaDeLogin(email) {
  bater(FALHAS.escopo + '|' + String(email || '').toLowerCase(), FALHAS.janelaMs, true);
}

function limparFalhasDeLogin(email) {
  janelas.delete(FALHAS.escopo + '|' + String(email || '').toLowerCase());
}

// Só para os testes: zera as janelas de um escopo (ou todas). Não há rota que
// chame isto — um "resetar limite" alcançável de fora seria a porta que o
// limite fecha.
function limpar(escopo) {
  if (!escopo) return janelas.clear();
  for (const k of janelas.keys()) if (k.startsWith(escopo + '|')) janelas.delete(k);
}

module.exports = {
  limitar, limpar, normalizarIp,
  contaBloqueada, registrarFalhaDeLogin, limparFalhasDeLogin, FALHAS
};
