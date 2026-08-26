// ═══════════════════════════════════════════════════════
// Perfil do locador — fora da família de recursos, de propósito.
//
// `profiles` não tem coluna `user_id`: a chave primária É o id do usuário, e
// existe no máximo uma linha por conta. Encaixá-la no CRUD genérico exigiria
// uma exceção dentro do middleware de escopo, que é justamente a função onde
// exceção não pode entrar.
//
// Por isso as rotas não têm `:id`: o único perfil que a sessão alcança é o
// dela, e sem parâmetro não há id de outra conta para tentar passar.
// ═══════════════════════════════════════════════════════

const express = require('express');
const { db } = require('../db');
const { exigirLogin } = require('../sessao');

const router = express.Router();
router.use(exigirLogin);

router.get('/', (req, res) => {
  const linha = db
    .prepare('select profile_data from profiles where id = ?')
    .get(req.usuario.id);

  let dados = {};
  try {
    if (linha) dados = JSON.parse(linha.profile_data);
  } catch {
    // Perfil corrompido não pode impedir o login. Volta vazio; a próxima
    // gravação o substitui.
  }
  res.json(dados || {});
});

router.put('/', (req, res) => {
  const dados = req.body && typeof req.body === 'object' ? req.body : {};
  db.prepare(`
    insert into profiles (id, profile_data, updated_at) values (?, ?, ?)
    on conflict(id) do update set profile_data = excluded.profile_data,
                                  updated_at   = excluded.updated_at
  `).run(req.usuario.id, JSON.stringify(dados), new Date().toISOString());
  res.json({ ok: true });
});

module.exports = router;
