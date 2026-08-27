// ═══════════════════════════════════════════════════════
// Link do inquilino — substitui as 4 RPCs SECURITY DEFINER.
//
// Estas rotas são PÚBLICAS por definição: o inquilino não tem conta. Era por
// isso que, no Postgres, `tenant_links` tinha RLS ligada com ZERO políticas e
// todo acesso passava por função `SECURITY DEFINER`. Aqui o papel dessa função
// é deste arquivo, e as invariantes são as mesmas.
//
// O servidor NUNCA vê o conteúdo: o payload chega cifrado em AES-GCM feito no
// navegador e a chave viaja só no fragmento da URL (`#tenant?id=&key=`), que
// não vai em request nem em Referer. O que está guardado aqui é opaco.
// ═══════════════════════════════════════════════════════

const express = require('express');
const crypto = require('node:crypto');
const { db } = require('../db');
const { exigirLogin } = require('../sessao');

const router = express.Router();

const TETO_PAYLOAD = 524288;        // 512 KB
const LIMITE_DIARIO = 100;          // links por usuário por dia
const DIAS_VALIDADE = 30;
const PROVA = /^[0-9a-f]{64}$/;

const sha256 = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const agora = () => new Date().toISOString();

// Apaga o que já venceu antes de responder. Isto substitui o pg_cron das
// 03:15: uma tabela que é lida a cada acesso não precisa de agendador para
// ser varrida.
function expurgar() {
  db.prepare('delete from tenant_links where expires_at < ?').run(agora());
}

// `req.ip` ja resolve XFF conforme o `trust proxy` de index.js — com ele
// desligado (o padrao), cabecalho forjado pelo signatario nao entra.
// O ::ffff: e o mapeamento IPv4-em-IPv6 do Node: some aqui, na gravacao, para
// nao virar ruido numa folha que alguem vai ler em juizo.
function ipDe(req) {
  return String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/i, '');
}

// ── Criar (locador, exige sessão) ───────────────────────────────────────
router.post('/', exigirLogin, (req, res) => {
  const { id, payload, key_proof } = req.body || {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ erro: 'Id do link ausente.' });
  }
  if (typeof payload !== 'string' || !payload) {
    return res.status(400).json({ erro: 'Payload ausente.' });
  }
  if (payload.length > TETO_PAYLOAD) {
    return res.status(413).json({ erro: 'Contrato grande demais para o link seguro.' });
  }
  if (key_proof != null && !PROVA.test(key_proof)) {
    return res.status(400).json({ erro: 'Prova de chave malformada.' });
  }

  // Teto diário por conta: sem ele, uma sessão roubada enche a tabela.
  const ontem = new Date(Date.now() - 864e5).toISOString();
  const { c } = db.prepare(
    'select count(*) c from tenant_links where created_by = ? and created_at > ?'
  ).get(req.usuario.id, ontem);
  if (c >= LIMITE_DIARIO) {
    return res.status(429).json({ erro: 'Limite diário de links atingido.' });
  }

  // Guarda SHA-256 DA PROVA, não a prova. O cliente já manda SHA-256(chave);
  // aqui hasheia de novo. Assim quem lê o banco não consegue escrever no link:
  // teria a prova guardada, mas não a prova que o servidor cobra.
  db.prepare(`
    insert into tenant_links
      (id, encrypted_payload, key_proof, created_by, created_at, expires_at)
    values (?, ?, ?, ?, ?, ?)
  `).run(
    id, payload,
    key_proof ? sha256(key_proof) : null,
    req.usuario.id, agora(),
    new Date(Date.now() + DIAS_VALIDADE * 864e5).toISOString()
  );

  res.status(201).json({ id });
});

// ── Ler (público) ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  expurgar();
  const linha = db
    .prepare('select encrypted_payload from tenant_links where id = ?')
    .get(req.params.id);

  // Devolve inclusive link já finalizado, de propósito: é o que permite ao
  // locador reabrir e importar o que o inquilino enviou.
  if (!linha) return res.status(404).json({ erro: 'Link inexistente ou expirado.' });
  res.json({ payload: linha.encrypted_payload });
});

// ── Evidência do aceite (público) ───────────────────────────────────────
// Rota separada de propósito: é a única parte da trilha que quem assina não
// redige, e mantê-la fora do payload cifrado é o que a torna evidência.
router.get('/:id/evidencia', (req, res) => {
  const linha = db
    .prepare('select finalized_at, finalized_ip from tenant_links where id = ?')
    .get(req.params.id);

  if (!linha || !linha.finalized_at) return res.json({ evidencia: null });
  res.json({
    evidencia: { finalizado_em: linha.finalized_at, finalizado_ip: linha.finalized_ip || '' }
  });
});

// ── Gravar (público — é o inquilino que escreve) ────────────────────────
router.put('/:id', (req, res) => {
  const { payload, key_proof, finalize } = req.body || {};

  if (typeof payload !== 'string' || !payload) {
    return res.status(400).json({ erro: 'Payload ausente.' });
  }
  if (payload.length > TETO_PAYLOAD) {
    return res.status(413).json({ erro: 'Contrato grande demais para o link seguro.' });
  }

  expurgar();
  const linha = db
    .prepare('select key_proof, finalized from tenant_links where id = ?')
    .get(req.params.id);

  // `gravou: false` em vez de erro HTTP: o front precisa distinguir "o servidor
  // recusou" de "a conexão caiu". CloudDB.updateContract descarta o link no
  // primeiro caso e não pode descartá-lo no segundo — o inquilino pode estar
  // preenchendo agora.
  if (!linha) return res.json({ gravou: false });
  if (linha.finalized) return res.json({ gravou: false });

  // A chave faz parte da autorização. Sem isto, quem descobrisse só o id
  // sobrescrevia e finalizava o contrato de fora.
  if (linha.key_proof) {
    if (!key_proof || !PROVA.test(key_proof) || sha256(key_proof) !== linha.key_proof) {
      return res.json({ gravou: false });
    }
  }

  // `finalized` é caminho só de ida: depois disso ninguém reescreve o payload,
  // mesmo tendo a URL inteira.
  if (finalize === true) {
    db.prepare(`
      update tenant_links
         set encrypted_payload = ?, finalized = 1,
             finalized_at = ?, finalized_ip = ?,
             expires_at = ?
       where id = ? and finalized = 0
    `).run(
      payload, agora(), ipDe(req),
      // Assinado: a janela de 30 dias não faz mais sentido. Encurta para 7,
      // o bastante para o locador importar.
      new Date(Date.now() + 7 * 864e5).toISOString(),
      req.params.id
    );
  } else {
    db.prepare(
      'update tenant_links set encrypted_payload = ? where id = ? and finalized = 0'
    ).run(payload, req.params.id);
  }

  res.json({ gravou: true });
});

module.exports = router;
