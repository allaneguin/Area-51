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
const { limitar } = require('../limite');

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

// A cota por ambiente (8 fotos, 2 vídeos) não impede criar vistorias e
// ambientes sem parar: um laço de `fetch` de uma sessão legítima enche o disco,
// e não há cota de disco por conta (dívida registrada na Parte III).
//
// Por CONTA, e não por IP: quem sobe arquivo já está autenticado, e o disco que
// enche é o dele. 120/hora cobre a vistoria mais detalhada com folga — 5
// ambientes com 8 fotos e 2 vídeos dão 50.
const limiteUpload = limitar({
  escopo: 'midia-upload', max: 120, janelaMs: 60 * 60_000,
  chave: req => req.usuario.id,
  mensagem: 'Muitos envios seguidos. Espere alguns minutos e continue.'
});

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
router.post('/', limiteUpload, corpoCru, (req, res) => {
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

// ── Listar ──────────────────────────────────────────────────────────────
// Sem os bytes: a tela precisa saber o que existe, nao carregar tudo.
router.get('/', (req, res) => {
  varrer();
  const linhas = db.prepare(`
    select id, ambiente, tipo, mime, bytes, created_at
      from midias
     where inspection_id = ? and user_id = ?
     order by ambiente, created_at
  `).all(String(req.query.vistoria || ''), req.usuario.id);
  res.json(linhas);
});

// ── Reindexar depois de remover um ambiente ─────────────────────────────
// `ambiente` e indice posicional dentro de inspections.rooms: tirar a Sala faz
// a Cozinha virar 0. Sem este passo, a foto da Sala apagada reaparece na
// Cozinha — e a vistoria passa a documentar o comodo errado.
//
// No servidor, e nao no cliente: sao um DELETE e um UPDATE na mesma requisicao.
// A mesma coisa no cliente seria uma sequencia de pedidos que uma recarga no
// meio deixa pela metade.
router.post('/reindexar', express.json(), (req, res) => {
  const { vistoria, removido } = req.body || {};
  const i = Number(removido);
  if (!Number.isInteger(i) || i < 0) return res.status(400).json({ erro: 'Ambiente inválido.' });
  if (!vistoriaDaSessao(String(vistoria || ''), req.usuario.id)) {
    return res.status(404).json({ erro: 'Vistoria não encontrada.' });
  }

  const doRemovido = db.prepare(
    'select arquivo from midias where inspection_id = ? and user_id = ? and ambiente = ?'
  ).all(vistoria, req.usuario.id, i);

  db.prepare('delete from midias where inspection_id = ? and user_id = ? and ambiente = ?')
    .run(vistoria, req.usuario.id, i);
  db.prepare('update midias set ambiente = ambiente - 1 where inspection_id = ? and user_id = ? and ambiente > ?')
    .run(vistoria, req.usuario.id, i);

  for (const m of doRemovido) {
    try { fs.unlinkSync(path.join(PASTA_UPLOADS, m.arquivo)); } catch { /* já sumiu */ }
  }
  res.json({ ok: true });
});

// ── O arquivo ───────────────────────────────────────────────────────────
// NUNCA uma pasta estatica: foto do imovel de um cliente com nome adivinhavel
// vaza por URL, sem sessao nenhuma. `sendFile` tambem trata `Range` sozinho, e
// e com Range que o <video> busca no meio sem baixar os 25 MB.
router.get('/:id/arquivo', (req, res) => {
  const m = db.prepare('select arquivo, mime from midias where id = ? and user_id = ?')
    .get(req.params.id, req.usuario.id);
  if (!m) return res.status(404).json({ erro: 'Mídia não encontrada.' });

  res.setHeader('Content-Type', m.mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.join(PASTA_UPLOADS, m.arquivo), (err) => {
    if (err && !res.headersSent) res.status(404).json({ erro: 'Arquivo indisponível.' });
  });
});

// ── Apagar ──────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const m = db.prepare('select arquivo from midias where id = ? and user_id = ?')
    .get(req.params.id, req.usuario.id);
  // 404 tanto para "nao existe" quanto para "e de outro": distinguir os dois
  // contaria ao chamador que aquele id existe em alguma conta.
  if (!m) return res.status(404).json({ erro: 'Mídia não encontrada.' });

  db.prepare('delete from midias where id = ? and user_id = ?').run(req.params.id, req.usuario.id);
  try { fs.unlinkSync(path.join(PASTA_UPLOADS, m.arquivo)); } catch { /* já sumiu */ }
  res.json({ ok: true });
});

module.exports = router;
module.exports.TIPOS = TIPOS;
module.exports.varrer = varrer;
