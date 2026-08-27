// ═══════════════════════════════════════════════════════
// O servidor. Serve o front de public/ e a API em /api.
//
// Os cabeçalhos que a Vercel enviava (X-Frame-Options, nosniff,
// Referrer-Policy) passam a sair daqui — sumiram junto com o vercel.json e
// não podiam sumir junto: o X-Frame-Options é quem barra clickjacking, já que
// `frame-ancestors` por <meta> o navegador ignora.
// ═══════════════════════════════════════════════════════

const express = require('express');
const path = require('node:path');

const PUBLICO = path.join(__dirname, '..', 'public');
const PORTA = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');

// Desligado por padrao, e isso e a parte que importa. O IP do aceite e a unica
// evidencia da trilha que quem assina nao redige — mas `X-Forwarded-For` e um
// cabecalho como outro qualquer: confiar nele sem proxy na frente deixa o
// proprio signatario escolher o IP que vai sair no certificado. Atras de um
// proxy de verdade, o operador liga: TRUST_PROXY=1 (ou 'loopback', ou o IP do
// proxy). Sem isso vale o endereco do socket, que ninguem forja.
app.set('trust proxy', process.env.TRUST_PROXY || false);

// 1 MB: o maior corpo legítimo é o payload cifrado do link (teto de 512 KB),
// que cresce ~33% em base64 no transporte JSON.
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/auth', require('./rotas/auth'));
app.use('/api/perfil', require('./rotas/perfil'));
app.use('/api/links', require('./rotas/links'));
app.use('/api/admin', require('./rotas/admin'));
// Antes do CRUD generico: ele casa qualquer /api/<coisa> e responderia
// "Recurso desconhecido" para /api/midias.
app.use('/api/midias', require('./rotas/midias'));
app.use('/api', require('./rotas/recursos'));

// Rota de API desconhecida responde JSON, não o index.html. Sem isto, um
// endpoint errado devolveria HTML com status 200 e o front tentaria fazer
// `JSON.parse` numa página inteira — erro que não diz o que aconteceu.
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota inexistente.' }));

// `/c` serve o app. É o atalho que `Utils.shareBaseUrl` monta nos links do
// inquilino: fica curto e sem "app.html" no meio, o que lê melhor no WhatsApp.
// Era um rewrite do `vercel.json`; com ele apagado, esta rota é quem o mantém —
// sem ela, TODO link de inquilino gerado em produção daria 404.
//
// A chave do link viaja no fragmento (`#tenant?id=&key=`), que nunca chega ao
// servidor: por isso servir o arquivo aqui basta, e por isso não pode ser um
// redirecionamento declarativo, que perderia o fragmento.
app.get('/c', (req, res) => res.sendFile(path.join(PUBLICO, 'app.html')));

app.use(express.static(PUBLICO, { extensions: ['html'] }));

// O app é uma SPA por HASH, não por path: o navegador nunca pede /contracts ao
// servidor. Então não há catch-all reescrevendo tudo para o index — caminho
// desconhecido é 404 de verdade.

// Handler de erro: o stack fica no servidor, o cliente recebe uma frase.
// Vazar stack numa resposta entrega caminho de arquivo e versão de dependência.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ erro: 'Erro interno.' });
});

if (require.main === module) {
  app.listen(PORTA, () => {
    console.log(`Meus Imóveis em http://localhost:${PORTA}`);
  });
}

module.exports = app;
