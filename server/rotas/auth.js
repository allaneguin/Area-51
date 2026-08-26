// ═══════════════════════════════════════════════════════
// Contas e sessão. Substitui supabaseClient.auth.
//
// O que NÃO existe mais e não é fingido: confirmação de e-mail e redefinição
// de senha por e-mail. Não há serviço de envio. A tela correspondente saiu do
// front — botão que não chega a e-mail nenhum é pior que botão nenhum.
// ═══════════════════════════════════════════════════════

const express = require('express');
const crypto = require('node:crypto');
const { db } = require('../db');
const {
  criarSenha, conferirSenha, abrirSessao, fecharSessao,
  usuarioDaSessao, exigirLogin
} = require('../sessao');

const router = express.Router();

const MIN_SENHA = 6;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Fronteira de confiança: validar aqui, não só na tela. O que chega no corpo
// pode nunca ter passado por um formulário.
function validar(email, senha) {
  if (!email || !EMAIL_OK.test(email)) return 'E-mail inválido.';
  if (!senha || String(senha).length < MIN_SENHA) {
    return `A senha precisa ter ao menos ${MIN_SENHA} caracteres.`;
  }
  return null;
}

const publico = (u) => ({ id: u.id, email: u.email, is_admin: !!u.is_admin });

// ── Cadastro ────────────────────────────────────────────────────────────
router.post('/registrar', (req, res) => {
  const email = String(req.body.email || '').trim();
  const senha = req.body.senha;

  const erro = validar(email, senha);
  if (erro) return res.status(400).json({ erro });

  const existe = db.prepare('select id from users where email = ?').get(email);
  if (existe) return res.status(409).json({ erro: 'already registered' });

  const { salt, senha_hash } = criarSenha(senha);
  const user = {
    id: crypto.randomUUID(),
    email,
    // Primeira conta do banco vira admin. Sem isso não haveria como chegar na
    // tela de administração num banco recém-criado, e a alternativa seria um
    // usuário-semente com senha fixa no código.
    is_admin: db.prepare('select count(*) c from users').get().c === 0 ? 1 : 0
  };

  db.prepare(`
    insert into users (id, email, senha_hash, salt, is_admin, criado_em)
    values (?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, senha_hash, salt, user.is_admin, new Date().toISOString());

  abrirSessao(res, user.id);
  res.status(201).json({ user: publico(user) });
});

// ── Entrar ──────────────────────────────────────────────────────────────
router.post('/entrar', (req, res) => {
  const email = String(req.body.email || '').trim();
  const senha = String(req.body.senha || '');

  const u = db.prepare('select * from users where email = ?').get(email);

  // Mesma resposta para e-mail inexistente e senha errada: distinguir os dois
  // transforma o login num verificador de quem tem conta aqui.
  if (!u || !conferirSenha(senha, u.salt, u.senha_hash)) {
    return res.status(401).json({ erro: 'Invalid login credentials' });
  }

  db.prepare('update users set ultimo_login = ? where id = ?').run(new Date().toISOString(), u.id);
  abrirSessao(res, u.id);
  res.json({ user: publico(u) });
});

// ── Sair ────────────────────────────────────────────────────────────────
router.post('/sair', (req, res) => {
  fecharSessao(req, res);
  res.json({ ok: true });
});

// ── Quem sou eu ─────────────────────────────────────────────────────────
// Sem sessão devolve 200 com user null, não 401: "não estou logado" é uma
// resposta normal desta rota, e o front a chama justamente para descobrir isso.
router.get('/sessao', (req, res) => {
  res.json({ user: usuarioDaSessao(req) });
});

// ── Trocar a senha (logado) ─────────────────────────────────────────────
router.put('/senha', exigirLogin, (req, res) => {
  const senha = req.body.senha;
  if (!senha || String(senha).length < MIN_SENHA) {
    return res.status(400).json({ erro: `A senha precisa ter ao menos ${MIN_SENHA} caracteres.` });
  }

  const { salt, senha_hash } = criarSenha(senha);
  db.prepare('update users set senha_hash = ?, salt = ? where id = ?')
    .run(senha_hash, salt, req.usuario.id);

  // Trocar a senha derruba as OUTRAS sessões. Quem troca a senha em geral
  // desconfia de que alguém entrou; deixar as sessões antigas vivas anularia
  // o motivo da troca. A sessão atual sobrevive para não deslogar quem pediu.
  const atual = req.headers.cookie || '';
  const token = (atual.match(/(?:^|;\s*)sessao=([^;]+)/) || [])[1];
  db.prepare('delete from sessions where user_id = ? and token != ?')
    .run(req.usuario.id, token ? decodeURIComponent(token) : '');

  res.json({ ok: true });
});

// ── Excluir a própria conta ─────────────────────────────────────────────
// Substitui a RPC delete_own_account. A senha é cobrada de novo aqui, e não só
// na tela: é a última confirmação antes de um apagamento em cascata.
router.delete('/conta', exigirLogin, (req, res) => {
  const senha = String(req.body.senha || '');
  const u = db.prepare('select * from users where id = ?').get(req.usuario.id);

  if (!u || !conferirSenha(senha, u.salt, u.senha_hash)) {
    return res.status(401).json({ erro: 'Senha incorreta. Nada foi apagado.' });
  }

  // `on delete cascade` em todas as tabelas leva contratos, imóveis, clientes,
  // financeiro, vistorias, perfil e sessões junto.
  db.prepare('delete from users where id = ?').run(req.usuario.id);
  fecharSessao(req, res);
  res.json({ ok: true });
});

module.exports = router;
