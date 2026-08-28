// ═══════════════════════════════════════════════════════
// Limite de tentativas por IP — janela fixa, em memória.
//
// Por que não `express-rate-limit`: ele resolveria isto, mas o sistema tem UMA
// dependência de propósito (`express`), e o pacote traz cinco transitivas para
// substituir as trinta linhas abaixo. O que o pacote dá a mais — store
// compartilhado (Redis), janela deslizante, cabeçalhos `RateLimit-*` — supõe
// vários processos. Este é um processo com um arquivo de banco. Quando houver
// mais de um, o Map aqui deixa de bastar, e aí o pacote (ou o Redis) entra pelo
// motivo certo, não por hábito.
//
// A CHAVE é `escopo + IP`, e o escopo é passado por quem monta o limite — nunca
// derivado da URL. Se ela entrasse na chave, `/api/links/<uuid>` daria a cada
// UUID o seu próprio orçamento, e a varredura de UUID — que é exatamente o que
// este arquivo existe para barrar — passaria sem encostar no teto.
// ═══════════════════════════════════════════════════════

const janelas = new Map();

// Janela fixa, não deslizante: o pior caso é o dobro do teto na virada da
// janela (5 no fim de uma, 5 no começo da seguinte). Para brute force de senha
// isso é irrelevante — 10 tentativas por minuto continua inviável — e a janela
// deslizante custaria guardar o carimbo de cada tentativa.
function limitar({ escopo, max, janelaMs, mensagem }) {
  return function (req, res, next) {
    const agora = Date.now();
    const chave = escopo + '|' + (req.ip || req.socket.remoteAddress || '');

    // Faxina preguiçosa, na escrita: mesma ideia do `expurgar()` dos links —
    // estrutura que se lê o tempo todo não precisa de agendador para encolher.
    if (janelas.size > 5000) {
      for (const [k, v] of janelas) if (v.ate <= agora) janelas.delete(k);
    }

    let janela = janelas.get(chave);
    if (!janela || janela.ate <= agora) {
      janela = { n: 0, ate: agora + janelaMs };
      janelas.set(chave, janela);
    }
    janela.n++;

    if (janela.n > max) {
      const segundos = Math.max(1, Math.ceil((janela.ate - agora) / 1000));
      res.setHeader('Retry-After', String(segundos));
      return res.status(429).json({
        erro: mensagem || `Muitas tentativas. Tente de novo em ${segundos} segundos.`
      });
    }
    next();
  };
}

// Só para os testes: zera as janelas entre casos. Não há rota que chame isto —
// um "resetar limite" alcançável de fora seria a porta que o limite fecha.
function limpar() {
  janelas.clear();
}

module.exports = { limitar, limpar };
