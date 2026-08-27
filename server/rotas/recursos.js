// ═══════════════════════════════════════════════════════
// CRUD genérico das 5 tabelas do app.
//
// Substitui a RLS do Postgres. A garantia não vem de cada handler lembrar de
// filtrar: vem de `router.use(exigirLogin)` na primeira linha e de todo SQL
// daqui levar `user_id = ?` com o id da SESSÃO. Handler nenhum lê usuário do
// corpo ou da query.
// ═══════════════════════════════════════════════════════

const express = require('express');
const { db, RECURSOS, paraFora, paraDentro } = require('../db');
const { exigirLogin } = require('../sessao');

const router = express.Router();

// Primeira linha do arquivo que roda: nada abaixo é alcançável sem sessão.
router.use(exigirLogin);

// Nome do recurso vira nome de tabela em SQL. Só passa o que está no mapa —
// esta é a única lista branca, e é por isso que a interpolação abaixo é segura.
function meta(req, res, next) {
  const m = RECURSOS[req.params.recurso];
  if (!m) return res.status(404).json({ erro: 'Recurso desconhecido.' });
  req.meta = m;
  req.tabela = req.params.recurso;
  next();
}

// ── Listar ──────────────────────────────────────────────────────────────
router.get('/:recurso', meta, (req, res) => {
  const linhas = db
    .prepare(`select * from ${req.tabela} where user_id = ?`)
    .all(req.usuario.id);
  res.json(linhas.map(l => paraFora(l, req.meta)));
});

// ── Gravar (upsert) ─────────────────────────────────────────────────────
router.put('/:recurso/:id', meta, (req, res) => {
  const id = req.params.id;
  const agora = new Date().toISOString();

  // Dono primeiro. Sem esta checagem, `on conflict do update` deixaria
  // qualquer usuário sobrescrever a linha de outro só conhecendo o id — os ids
  // são gerados no cliente e viajam em link, então "conhecer o id" é barato.
  const dono = db
    .prepare(`select user_id, created_at from ${req.tabela} where id = ?`)
    .get(id);
  if (dono && dono.user_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Este registro é de outra conta.' });
  }

  // O id vem da URL e o user_id da sessão: o que o corpo disser sobre os dois
  // é ignorado, não rejeitado — cliente antigo mandava ambos no corpo.
  const entrada = { ...req.body, id, user_id: req.usuario.id };
  entrada.updated_at = agora;
  // `created_at` NUNCA pode faltar aqui. O upsert avalia o INSERT primeiro, e a
  // coluna e NOT NULL: uma gravacao que so mande os campos alterados (o front
  // faz isso a cada edicao) estourava a constraint e voltava 500 — a alteracao
  // se perdia. Linha ja existente reusa o proprio valor; o `set` abaixo nao
  // inclui created_at, entao a data de criacao continua imutavel.
  entrada.created_at = (dono && dono.created_at) || entrada.created_at || agora;

  const cols = req.meta.colunas.filter(c => c in entrada);
  const valores = cols.map(c => paraDentro(entrada[c], c, req.meta));
  const marcas = cols.map(() => '?').join(', ');
  const set = cols
    .filter(c => c !== 'id' && c !== 'user_id' && c !== 'created_at')
    .map(c => `${c} = excluded.${c}`)
    .join(', ');

  db.prepare(`
    insert into ${req.tabela} (${cols.join(', ')}) values (${marcas})
    on conflict(id) do update set ${set}
  `).run(...valores);

  const salvo = db.prepare(`select * from ${req.tabela} where id = ?`).get(id);
  res.json(paraFora(salvo, req.meta));
});

// ── Excluir ─────────────────────────────────────────────────────────────
router.delete('/:recurso/:id', meta, (req, res) => {
  // O `and user_id` faz o trabalho: id de outra conta simplesmente não casa.
  const r = db
    .prepare(`delete from ${req.tabela} where id = ? and user_id = ?`)
    .run(req.params.id, req.usuario.id);

  // 404 tanto para "não existe" quanto para "é de outro": distinguir os dois
  // contaria ao chamador que aquele id existe em alguma conta.
  if (r.changes === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
