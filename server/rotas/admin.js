// ═══════════════════════════════════════════════════════
// Supervisão de contas — substitui admin_list_contracts e admin_list_users.
//
// Duas regras herdadas do Postgres, ambas ainda valendo:
//
// 1. `cloud_key` NUNCA sai daqui. É a chave AES dos links do inquilino: com ela
//    e o id, qualquer um decifra o contrato. Era o motivo da migration 002.
// 2. O admin é SOMENTE LEITURA e NÃO enxerga o ERP — nada de imóveis, clientes,
//    financeiro ou vistorias. Supervisão de contas não é acesso ao negócio
//    alheio.
// ═══════════════════════════════════════════════════════

const express = require('express');
const { db } = require('../db');
const { exigirLogin, exigirAdmin } = require('../sessao');

const router = express.Router();
router.use(exigirLogin, exigirAdmin);

// Colunas listadas uma a uma, nunca `select *`: com `*`, o dia em que alguém
// adicionar uma coluna sensível a `contracts` ela vaza por aqui sem ninguém
// tocar neste arquivo.
router.get('/contracts', (req, res) => {
  const linhas = db.prepare(`
    select id, user_id, name, template_id, fields, is_finalized,
           created_at, updated_at
      from contracts
  `).all();

  res.json(linhas.map(l => {
    let fields = {};
    try { fields = JSON.parse(l.fields); } catch { /* contrato corrompido não derruba a lista */ }
    return { ...l, fields, is_finalized: !!l.is_finalized };
  }));
});

router.get('/profiles', (req, res) => {
  const linhas = db.prepare('select id, profile_data from profiles').all();
  res.json(linhas.map(l => {
    let profile_data = {};
    try { profile_data = JSON.parse(l.profile_data); } catch { /* idem */ }
    return { id: l.id, profile_data };
  }));
});

// Nomes de campo em inglês (`created_at`, `last_sign_in_at`) porque é o que
// `SuperAdmin.groupAccounts` já lê. Renomear aqui obrigaria a mexer no front,
// que este trabalho promete não tocar.
router.get('/users', (req, res) => {
  const linhas = db.prepare(`
    select id, email, criado_em, ultimo_login, is_admin from users
  `).all();

  res.json(linhas.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.criado_em,
    last_sign_in_at: u.ultimo_login,
    is_admin: !!u.is_admin
  })));
});

module.exports = router;
