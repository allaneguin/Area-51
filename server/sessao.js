// ═══════════════════════════════════════════════════════
// Senha e sessão — substitui supabaseClient.auth inteiro.
//
// Sem dependência de hashing: `scrypt` vem do node:crypto e é o que se deve
// usar para senha (lento de propósito). bcrypt/argon2 trariam compilação
// nativa no Windows para resolver um problema que a stdlib já resolve.
// ═══════════════════════════════════════════════════════

const crypto = require('node:crypto');
const { db } = require('./db');

const DIAS = 30;
const CUSTO = { N: 16384, r: 8, p: 1 };   // ~100ms por hash nesta máquina
const TAMANHO_HASH = 64;

// ── Senha ───────────────────────────────────────────────────────────────

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, TAMANHO_HASH, CUSTO).toString('hex');
}

function criarSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, senha_hash: hashSenha(senha, salt) };
}

// timingSafeEqual e não `===`: comparar hash byte a byte com saída antecipada
// vaza, pelo tempo de resposta, quantos caracteres iniciais estavam certos.
function conferirSenha(senha, salt, esperado) {
  const a = Buffer.from(hashSenha(senha, salt), 'hex');
  const b = Buffer.from(esperado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Sessão ──────────────────────────────────────────────────────────────

const NOME_COOKIE = 'sessao';

function abrirSessao(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DIAS * 864e5).toISOString();

  db.prepare('insert into sessions (token, user_id, expira_em) values (?, ?, ?)')
    .run(token, userId, expira);

  // httpOnly não é opcional aqui: o app tem `unsafe-inline` na CSP e ~85
  // handlers inline, então um XSS lê tudo que o JS alcança. A sessão não pode
  // estar entre essas coisas.
  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: !!process.env.HTTPS,
    maxAge: DIAS * 864e5,
    path: '/'
  });
  return token;
}

function fecharSessao(req, res) {
  const token = lerCookie(req);
  if (token) db.prepare('delete from sessions where token = ?').run(token);
  res.clearCookie(NOME_COOKIE, { path: '/' });
}

function lerCookie(req) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === NOME_COOKIE) {
      return decodeURIComponent(parte.slice(i + 1).trim());
    }
  }
  return null;
}

// Devolve o usuário da sessão, ou null. Sessão vencida é apagada na leitura —
// o mesmo motivo pelo qual os links expirados não precisam de agendador.
function usuarioDaSessao(req) {
  const token = lerCookie(req);
  if (!token) return null;

  const linha = db.prepare(`
    select u.id, u.email, u.is_admin, s.expira_em
      from sessions s join users u on u.id = s.user_id
     where s.token = ?
  `).get(token);

  if (!linha) return null;
  if (new Date(linha.expira_em) < new Date()) {
    db.prepare('delete from sessions where token = ?').run(token);
    return null;
  }
  return { id: linha.id, email: linha.email, is_admin: !!linha.is_admin };
}

// ── Middlewares ─────────────────────────────────────────────────────────

// O ÚNICO lugar que define quem é o dono da requisição. Toda rota de recurso
// passa por aqui e lê `req.usuario.id`; nenhuma aceita id de usuário vindo do
// corpo ou da query. É isto que substitui a RLS — e é por ser um só que se
// pode afirmar que substitui.
function exigirLogin(req, res, next) {
  const u = usuarioDaSessao(req);
  if (!u) return res.status(401).json({ erro: 'Sessão expirada ou inexistente.' });
  req.usuario = u;
  next();
}

function exigirAdmin(req, res, next) {
  if (!req.usuario || !req.usuario.is_admin) {
    return res.status(403).json({ erro: 'Acesso restrito.' });
  }
  next();
}

module.exports = {
  criarSenha, conferirSenha, hashSenha,
  abrirSessao, fecharSessao, usuarioDaSessao,
  exigirLogin, exigirAdmin, NOME_COOKIE
};
