// ═══════════════════════════════════════════════════════
// Mídia da vistoria — fotos e vídeos por ambiente.
//
// Fora do CRUD genérico de propósito. Lá o corpo do pedido decide o conteúdo
// das colunas declaradas, e uma delas é `arquivo`: o nome de um arquivo real no
// disco. Cliente que escolhe nome de arquivo lê o arquivo de qualquer um.
//
// O upload é de corpo CRU, não multipart: o navegador manda o Blob direto
// (`fetch(url, { method: 'POST', body: blob })`) e o Content-Type dele diz o que
// é. Multipart exigiria uma dependência para resolver o que uma linha resolve.
// ═══════════════════════════════════════════════════════

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, PASTA_UPLOADS } = require('../db');
const { exigirLogin } = require('../sessao');

const router = express.Router();

// Primeira linha do arquivo que roda: nada abaixo é alcançável sem sessão.
router.use(exigirLogin);

// Teto e quantidade por tipo. Sem quantidade máxima, um ambiente engole o disco
// e ninguém percebe até acabar.
const TIPOS = {
  foto: {
    mimes: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
    teto: 8 * 1024 * 1024,
    max: 8
  },
  video: {
    mimes: { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov' },
    teto: 25 * 1024 * 1024,
    max: 2
  }
};

const TODOS_OS_MIMES = Object.values(TIPOS).flatMap(t => Object.keys(t.mimes));

// O teto do middleware é o do MAIOR tipo; o teto por tipo é conferido no
// handler. Corpo acima disto o Express recusa antes de alocar memória.
const corpoCru = express.raw({ type: TODOS_OS_MIMES, limit: '25mb' });

// Arquivo sem linha é lixo: acontece se o processo morrer entre gravar o
// arquivo e inserir a linha, e é o que sobra quando a cascata do SQLite apaga
// as linhas de uma vistoria excluída. Quem recolhe é a própria leitura — o
// mesmo desenho do `expurgar()` dos links, que dispensou o agendador.
function varrer() {
  let nomes;
  try { nomes = fs.readdirSync(PASTA_UPLOADS); } catch { return; }
  if (!nomes.length) return;
  const vivos = new Set(db.prepare('select arquivo from midias').all().map(l => l.arquivo));
  for (const nome of nomes) {
    if (vivos.has(nome)) continue;
    try { fs.unlinkSync(path.join(PASTA_UPLOADS, nome)); } catch { /* já sumiu */ }
  }
}

// A vistoria é da sessão? Vale para todas as rotas que recebem `vistoria`.
function vistoriaDaSessao(id, usuarioId) {
  const linha = db.prepare('select user_id from inspections where id = ?').get(id);
  return !!(linha && linha.user_id === usuarioId);
}

// ── Subir ───────────────────────────────────────────────────────────────
router.post('/', corpoCru, (req, res) => {
  varrer();

  const meta = TIPOS[req.query.tipo];
  if (!meta) return res.status(400).json({ erro: 'Tipo de mídia inválido.' });

  const ambiente = Number(req.query.ambiente);
  if (!Number.isInteger(ambiente) || ambiente < 0) {
    return res.status(400).json({ erro: 'Ambiente inválido.' });
  }

  const vistoria = String(req.query.vistoria || '');
  if (!vistoriaDaSessao(vistoria, req.usuario.id)) {
    return res.status(404).json({ erro: 'Vistoria não encontrada.' });
  }

  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = meta.mimes[mime];
  if (!ext) return res.status(415).json({ erro: 'Formato de arquivo não aceito.' });

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ erro: 'Arquivo vazio.' });
  }
  if (req.body.length > meta.teto) {
    return res.status(413).json({ erro: 'Arquivo acima do limite.' });
  }

  const { n } = db.prepare(
    'select count(*) n from midias where inspection_id = ? and ambiente = ? and tipo = ?'
  ).get(vistoria, ambiente, req.query.tipo);
  if (n >= meta.max) {
    return res.status(409).json({ erro: `Limite de ${meta.max} por ambiente atingido.` });
  }

  // Arquivo primeiro, linha depois: linha sem arquivo é cartão quebrado na
  // tela; arquivo sem linha é lixo, e lixo a varredura recolhe.
  const id = crypto.randomUUID();
  const arquivo = `${id}.${ext}`;
  const criado = new Date().toISOString();
  fs.writeFileSync(path.join(PASTA_UPLOADS, arquivo), req.body);

  db.prepare(`
    insert into midias (id, user_id, inspection_id, ambiente, tipo, mime, bytes, arquivo, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.usuario.id, vistoria, ambiente, req.query.tipo, mime, req.body.length, arquivo, criado);

  res.status(201).json({
    id, ambiente, tipo: req.query.tipo, mime, bytes: req.body.length, created_at: criado
  });
});

module.exports = router;
module.exports.TIPOS = TIPOS;
module.exports.varrer = varrer;
