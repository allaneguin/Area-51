// Testes do backend. Rodar: node --no-warnings=ExperimentalWarning server/servidor.test.js
//
// O teste que mais importa aqui é o de ESCOPO. Enquanto o backend era a
// Supabase, quem impedia a conta A de ler a conta B era a RLS do Postgres — uma
// garantia do banco, que valia mesmo se o código do servidor errasse. Agora
// quem garante é código nosso. Uma garantia que virou código precisa virar
// teste junto, senão o que se fez foi trocar uma parede por uma intenção.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Banco descartável, antes de carregar o app (db.js lê isto na carga).
const DB = path.join(os.tmpdir(), `mi-test-${process.pid}.db`);
process.env.DB_FILE = DB;
// A pasta de midia tambem precisa ser descartavel: sem isto o teste cria
// `uploads/` na raiz do repositorio e deixa arquivo la depois de rodar.
const UPLOADS = path.join(os.tmpdir(), `mi-test-uploads-${process.pid}`);
process.env.UPLOADS_DIR = UPLOADS;
for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s); } catch {} }

const app = require('./index');

let base;
const servidor = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${servidor.address().port}`; });
test.after(() => {
  servidor.close();
  try { fs.rmSync(UPLOADS, { recursive: true, force: true }); } catch {}
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s); } catch {} }
});

// Cada "cliente" tem seu pote de cookies: é o que permite ter duas contas vivas
// ao mesmo tempo no teste, que é o cenário do teste de escopo.
function cliente() {
  let cookie = '';
  async function req(metodo, caminho, corpo) {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: {
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch {}
    return { status: r.status, dados, setCookie: set };
  };
  // O upload de midia manda bytes crus, entao nao passa por `req` — mas precisa
  // da MESMA sessao. Expor o cookie evita refazer login no meio da suite (a
  // senha de B e outra, e um teste adiante troca a de quem loga de novo).
  req.cookie = () => cookie;
  return req;
}

const A = cliente();
const B = cliente();
const anon = cliente();

// ── Contas e senha ──────────────────────────────────────────────────────

test('registra a primeira conta e ela nasce admin', async () => {
  const r = await A('POST', '/api/auth/registrar', { email: 'a@teste.com', senha: 'segredo123' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.user.email, 'a@teste.com');
  assert.strictEqual(r.dados.user.is_admin, true, 'a primeira conta do banco vira admin');
});

test('a segunda conta NAO nasce admin', async () => {
  const r = await B('POST', '/api/auth/registrar', { email: 'b@teste.com', senha: 'segredo456' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.user.is_admin, false);
});

test('o cookie de sessao e httpOnly e SameSite=Strict', async () => {
  const c = cliente();
  const r = await c('POST', '/api/auth/registrar', { email: 'cookie@teste.com', senha: 'segredo123' });
  const bruto = r.setCookie.join(';');
  // httpOnly e o que impede um XSS de ler a sessao. O app tem `unsafe-inline`
  // na CSP, entao essa flag nao e detalhe: e a unica coisa entre um XSS e a
  // conta do usuario.
  assert.match(bruto, /HttpOnly/i);
  assert.match(bruto, /SameSite=Strict/i);
});

test('e-mail duplicado e recusado', async () => {
  const r = await cliente()('POST', '/api/auth/registrar', { email: 'a@teste.com', senha: 'outrasenha' });
  assert.strictEqual(r.status, 409);
});

test('senha curta e e-mail invalido sao recusados no SERVIDOR', async () => {
  const c = cliente();
  assert.strictEqual((await c('POST', '/api/auth/registrar', { email: 'x@y.com', senha: '123' })).status, 400);
  assert.strictEqual((await c('POST', '/api/auth/registrar', { email: 'semarroba', senha: 'segredo123' })).status, 400);
});

test('senha errada e e-mail inexistente dao a MESMA resposta', async () => {
  const c = cliente();
  const errada = await c('POST', '/api/auth/entrar', { email: 'a@teste.com', senha: 'nao-e-essa' });
  const inexistente = await c('POST', '/api/auth/entrar', { email: 'ninguem@teste.com', senha: 'nao-e-essa' });
  // Distinguir os dois transformaria o login num verificador de quem tem conta.
  assert.strictEqual(errada.status, 401);
  assert.strictEqual(inexistente.status, 401);
  assert.strictEqual(errada.dados.erro, inexistente.dados.erro);
});

test('a senha nao e guardada em claro, e o salt difere entre contas', () => {
  const { db } = require('./db');
  const a = db.prepare('select senha_hash, salt from users where email = ?').get('a@teste.com');
  const b = db.prepare('select senha_hash, salt from users where email = ?').get('b@teste.com');
  assert.ok(!a.senha_hash.includes('segredo123'));
  assert.notStrictEqual(a.salt, b.salt, 'salt igual entre contas anularia o proposito dele');

  // Mesma senha em contas diferentes tem de produzir hash diferente — e o que
  // impede descobrir, olhando a tabela, que duas pessoas usam a mesma senha.
  const { criarSenha } = require('./sessao');
  assert.notStrictEqual(criarSenha('igual').senha_hash, criarSenha('igual').senha_hash);
});

// ── Sessao ──────────────────────────────────────────────────────────────

test('sem cookie, /sessao responde 200 com user null', async () => {
  const r = await anon('GET', '/api/auth/sessao');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.dados.user, null);
});

test('cookie inventado nao autentica', async () => {
  const r = await fetch(base + '/api/contracts', { headers: { Cookie: 'sessao=' + 'f'.repeat(64) } });
  assert.strictEqual(r.status, 401);
});

test('sessao expirada e recusada E apagada na leitura', async () => {
  const { db } = require('./db');
  const c = cliente();
  await c('POST', '/api/auth/registrar', { email: 'expira@teste.com', senha: 'segredo123' });
  const u = db.prepare('select id from users where email = ?').get('expira@teste.com');
  db.prepare('update sessions set expira_em = ? where user_id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), u.id);

  assert.strictEqual((await c('GET', '/api/contracts')).status, 401);
  const { n } = db.prepare('select count(*) n from sessions where user_id = ?').get(u.id);
  assert.strictEqual(n, 0, 'sessao vencida some na leitura, sem agendador');
});

// ── ESCOPO: o teste que substitui a RLS ─────────────────────────────────

const RECURSOS = ['contracts', 'properties', 'clients', 'financial_records', 'inspections'];

const corpoDe = (recurso, id) => ({
  contracts: { id, name: 'Contrato de A', template_id: 'residencial', fields: { valor_aluguel: '2.450,00' } },
  properties: { id, name: 'Imovel de A', address: 'Rua A, 1' },
  clients: { id, name: 'Cliente de A', document: '111' },
  financial_records: { id, description: 'Aluguel', due_date: '2026-08-10', rent_value: 2450 },
  inspections: { id, tipo: 'Entrada', rooms: [{ nome: 'Sala', estado: 'Bom' }] }
}[recurso]);

test('toda rota de recurso exige sessao', async () => {
  for (const r of RECURSOS) {
    assert.strictEqual((await anon('GET', `/api/${r}`)).status, 401, `GET ${r} sem sessao`);
    assert.strictEqual((await anon('PUT', `/api/${r}/x`, { id: 'x' })).status, 401, `PUT ${r} sem sessao`);
    assert.strictEqual((await anon('DELETE', `/api/${r}/x`)).status, 401, `DELETE ${r} sem sessao`);
  }
  assert.strictEqual((await anon('GET', '/api/perfil')).status, 401);
  assert.strictEqual((await anon('PUT', '/api/perfil', {})).status, 401);
});

test('A grava em todos os recursos e B nao enxerga nada disso', async () => {
  for (const r of RECURSOS) {
    const put = await A('PUT', `/api/${r}/id-de-a`, corpoDe(r, 'id-de-a'));
    assert.strictEqual(put.status, 200, `A deveria gravar em ${r}`);

    const deA = await A('GET', `/api/${r}`);
    assert.strictEqual(deA.dados.length, 1, `A deveria ver o proprio registro em ${r}`);

    const deB = await B('GET', `/api/${r}`);
    assert.deepStrictEqual(deB.dados, [], `B NAO pode ver o registro de A em ${r}`);
  }
});

test('B nao sobrescreve registro de A mesmo sabendo o id', async () => {
  for (const r of RECURSOS) {
    const invasao = await B('PUT', `/api/${r}/id-de-a`, { ...corpoDe(r, 'id-de-a'), name: 'INVADIDO' });
    assert.strictEqual(invasao.status, 403, `B nao pode sobrescrever ${r} de A`);
  }
  // E o dado de A continua intacto.
  const props = await A('GET', '/api/properties');
  assert.strictEqual(props.dados[0].name, 'Imovel de A');
});

test('B nao apaga registro de A mesmo sabendo o id', async () => {
  for (const r of RECURSOS) {
    const tentativa = await B('DELETE', `/api/${r}/id-de-a`);
    // 404, nao 403: dizer "existe, mas nao e seu" ja conta que aquele id existe
    // em alguma conta.
    assert.strictEqual(tentativa.status, 404, `B nao pode apagar ${r} de A`);
    assert.strictEqual((await A('GET', `/api/${r}`)).dados.length, 1, `${r} de A sobreviveu`);
  }
});

test('gravacao parcial de registro existente persiste (bug do created_at)', async () => {
  // O front manda so os campos alterados. O upsert avalia o INSERT antes do
  // `on conflict`, entao sem created_at no corpo a coluna NOT NULL estourava e
  // a rota devolvia 500: nenhuma edicao de contrato chegava ao banco. Era isso
  // que fazia o cloud_id do link do inquilino nunca gravar — e a importacao,
  // sem achar o contrato pelo cloud_id, criava uma COPIA so com os dados dele.
  const criacao = await A('PUT', '/api/contracts/parcial-1', {
    id: 'parcial-1', name: 'Contrato', template_id: 'residencial',
    fields: { valor_aluguel: '1.500,00' },
    created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z'
  });
  assert.strictEqual(criacao.status, 200);

  const parcial = await A('PUT', '/api/contracts/parcial-1', {
    id: 'parcial-1', name: 'Contrato', template_id: 'residencial',
    fields: { valor_aluguel: '1.500,00' },
    cloud_id: '40733ad4-1b43-4151-b55e-722879043795', cloud_key: 'chave-do-link'
  });
  assert.strictEqual(parcial.status, 200, 'gravacao sem created_at nao pode dar 500');
  assert.strictEqual(parcial.dados.cloud_id, '40733ad4-1b43-4151-b55e-722879043795');
  assert.strictEqual(parcial.dados.created_at, '2020-01-01T00:00:00.000Z',
    'a data de criacao e imutavel — o update nao pode reescreve-la');

  const lido = (await A('GET', '/api/contracts')).dados.find(c => c.id === 'parcial-1');
  assert.strictEqual(lido.cloud_id, '40733ad4-1b43-4151-b55e-722879043795',
    'o cloud_id tem que sobreviver ao recarregamento');
  await A('DELETE', '/api/contracts/parcial-1');
});

test('o perfil de A nao vaza para B', async () => {
  await A('PUT', '/api/perfil', { nome_locador: 'Locador A', doc_locador: '123' });
  assert.strictEqual((await A('GET', '/api/perfil')).dados.nome_locador, 'Locador A');
  assert.deepStrictEqual((await B('GET', '/api/perfil')).dados, {},
    'B tem o proprio perfil, vazio — as rotas de perfil nao tem :id por isso');
});

test('recurso fora da lista branca nao vira SQL', async () => {
  assert.strictEqual((await A('GET', '/api/users')).status, 404);
  assert.strictEqual((await A('GET', '/api/sessions')).status, 404);
  assert.strictEqual((await A('GET', '/api/sqlite_master')).status, 404);
});

// ── Forma da resposta: a armadilha do jsonb ─────────────────────────────

test('fields volta como OBJETO, nao string', async () => {
  const r = await A('GET', '/api/contracts');
  const c = r.dados[0];
  // O PostgREST devolvia jsonb ja parseado; o SQLite guarda texto. Se a
  // conversao na borda sumir, `fields.valor_aluguel` vira undefined em todas as
  // telas e nada acusa — a tela so mostra vazio.
  assert.strictEqual(typeof c.fields, 'object');
  assert.strictEqual(c.fields.valor_aluguel, '2.450,00');
  assert.strictEqual(typeof c.is_finalized, 'boolean', 'SQLite guarda 0/1; o front espera boolean');
});

test('rooms da vistoria volta como ARRAY', async () => {
  const r = await A('GET', '/api/inspections');
  assert.ok(Array.isArray(r.dados[0].rooms));
  assert.strictEqual(r.dados[0].rooms[0].nome, 'Sala');
});

// ── Link do inquilino ───────────────────────────────────────────────────

const sha256 = (t) => require('node:crypto').createHash('sha256').update(String(t), 'utf8').digest('hex');
const CHAVE = 'chave-de-16-cars';
const PROVA = sha256(CHAVE);

test('criar link exige sessao', async () => {
  const r = await anon('POST', '/api/links', { id: 'l1', payload: 'xxx', key_proof: PROVA });
  assert.strictEqual(r.status, 401);
});

test('ciclo do link: criar, ler sem sessao, gravar com a prova certa', async () => {
  assert.strictEqual((await A('POST', '/api/links', { id: 'l1', payload: 'cifrado-v1', key_proof: PROVA })).status, 201);

  // O inquilino nao tem conta: a leitura e publica de proposito.
  const leitura = await anon('GET', '/api/links/l1');
  assert.strictEqual(leitura.status, 200);
  assert.strictEqual(leitura.dados.payload, 'cifrado-v1');

  const escrita = await anon('PUT', '/api/links/l1', { payload: 'cifrado-v2', key_proof: PROVA });
  assert.strictEqual(escrita.dados.gravou, true);
  assert.strictEqual((await anon('GET', '/api/links/l1')).dados.payload, 'cifrado-v2');
});

test('prova de chave errada NAO grava', async () => {
  const r = await anon('PUT', '/api/links/l1', { payload: 'invasao', key_proof: sha256('chave-errada') });
  // `gravou: false`, nao erro HTTP: quem chama precisa separar recusa de falha
  // de rede, porque so numa delas o link deve ser descartado.
  assert.strictEqual(r.dados.gravou, false);
  assert.strictEqual((await anon('GET', '/api/links/l1')).dados.payload, 'cifrado-v2', 'payload intacto');
});

test('sem prova nenhuma NAO grava', async () => {
  const r = await anon('PUT', '/api/links/l1', { payload: 'invasao' });
  assert.strictEqual(r.dados.gravou, false);
});

test('a prova guardada no banco NAO e a prova que o servidor cobra', () => {
  const { db } = require('./db');
  const linha = db.prepare('select key_proof from tenant_links where id = ?').get('l1');
  // O cliente manda SHA-256(chave); o servidor guarda SHA-256 disso. Quem le o
  // banco tem a prova guardada, mas nao a que abre a porta.
  assert.notStrictEqual(linha.key_proof, PROVA);
  assert.strictEqual(linha.key_proof, sha256(PROVA));
});

test('finalizar e caminho so de ida', async () => {
  const fim = await anon('PUT', '/api/links/l1', { payload: 'assinado', key_proof: PROVA, finalize: true });
  assert.strictEqual(fim.dados.gravou, true);

  const depois = await anon('PUT', '/api/links/l1', { payload: 'depois-de-assinar', key_proof: PROVA });
  assert.strictEqual(depois.dados.gravou, false, 'link finalizado nao aceita mais escrita');

  // Ler continua funcionando: e o que permite ao locador importar o que foi enviado.
  assert.strictEqual((await anon('GET', '/api/links/l1')).dados.payload, 'assinado');
});

test('a evidencia do aceite e carimbada pelo SERVIDOR', async () => {
  const r = await anon('GET', '/api/links/l1/evidencia');
  assert.ok(r.dados.evidencia, 'link finalizado tem evidencia');
  assert.ok(r.dados.evidencia.finalizado_em, 'com data do servidor');
  // Fica fora do payload cifrado de proposito: e a unica parte da trilha que
  // quem assina nao redige.
});

test('o IP do aceite NAO sai de cabecalho que o signatario manda', async () => {
  // `X-Forwarded-For` e um cabecalho como outro qualquer: quem assina escolhe o
  // valor. Se o servidor carimbasse ele sem proxy na frente, o unico campo da
  // trilha que o signatario nao deveria redigir passaria a ser o mais facil de
  // forjar — e sairia numa folha que se chama certificado.
  await A('POST', '/api/links', { id: 'l-xff', payload: 'v1', key_proof: PROVA });
  const r = await fetch(base + '/api/links/l-xff', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' },
    body: JSON.stringify({ payload: 'assinado', key_proof: PROVA, finalize: true })
  });
  assert.strictEqual((await r.json()).gravou, true);

  const { db } = require('./db');
  const linha = db.prepare('select finalized_ip from tenant_links where id = ?').get('l-xff');
  assert.notStrictEqual(linha.finalized_ip, '8.8.8.8', 'cabecalho forjado nao pode virar evidencia');
  assert.ok(/^(::1|127\.)/.test(linha.finalized_ip), 'vale o endereco do socket: ' + linha.finalized_ip);
});

test('link inexistente e link expirado dao 404', async () => {
  assert.strictEqual((await anon('GET', '/api/links/nao-existe')).status, 404);

  const { db } = require('./db');
  await A('POST', '/api/links', { id: 'velho', payload: 'x', key_proof: PROVA });
  db.prepare('update tenant_links set expires_at = ? where id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), 'velho');

  assert.strictEqual((await anon('GET', '/api/links/velho')).status, 404);
  const { n } = db.prepare('select count(*) n from tenant_links where id = ?').get('velho');
  assert.strictEqual(n, 0, 'expirado some na leitura — e o que substitui o pg_cron');
});

test('payload acima de 512 KB e recusado', async () => {
  const gigante = 'x'.repeat(524289);
  assert.strictEqual((await A('POST', '/api/links', { id: 'grande', payload: gigante, key_proof: PROVA })).status, 413);
});

// ── Admin ───────────────────────────────────────────────────────────────

// ── Midia da vistoria ───────────────────────────────────────────────────

test('apagar a vistoria leva as midias junto (cascata)', async () => {
  const { db, PASTA_UPLOADS } = require('./db');
  assert.ok(fs.existsSync(PASTA_UPLOADS), 'a pasta de uploads nasce com o servidor');

  await A('PUT', '/api/inspections/v-cascata', { id: 'v-cascata', tipo: 'Entrada', rooms: [] });
  const dono = (await A('GET', '/api/auth/sessao')).dados.user.id;
  db.prepare(`insert into midias (id, user_id, inspection_id, ambiente, tipo, mime, bytes, arquivo, created_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('m-cascata', dono, 'v-cascata', 0, 'foto', 'image/jpeg', 10, 'm-cascata.jpg', new Date().toISOString());

  assert.strictEqual(db.prepare('select count(*) n from midias').get().n, 1);
  assert.strictEqual((await A('DELETE', '/api/inspections/v-cascata')).status, 200);
  assert.strictEqual(db.prepare('select count(*) n from midias').get().n, 0,
    'a linha de midia nao pode sobreviver a vistoria que ela documenta');
});

// Corpo cru, nao multipart: o teste fala com a rota do mesmo jeito que o
// navegador (fetch com o Blob no body).
async function enviar(cookie, qs, mime, bytes) {
  const r = await fetch(base + '/api/midias?' + qs, {
    method: 'POST',
    headers: { 'Content-Type': mime, ...(cookie ? { Cookie: cookie } : {}) },
    body: bytes
  });
  let dados = null;
  try { dados = JSON.parse(await r.text()); } catch {}
  return { status: r.status, dados };
}

test('sobe uma foto para o ambiente da vistoria', async () => {
  await A('PUT', '/api/inspections/v1', { id: 'v1', tipo: 'Entrada', rooms: [{ nome: 'Sala', estado: 'Bom' }] });
  const r = await enviar(A.cookie(), 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', Buffer.from('fingindo-ser-jpeg'));
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.tipo, 'foto');
  assert.strictEqual(r.dados.ambiente, 0);
  assert.strictEqual(r.dados.bytes, 17);
});

test('midia exige sessao', async () => {
  const r = await enviar('', 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', Buffer.from('x'));
  assert.strictEqual(r.status, 401);
});

test('B nao sobe midia para vistoria de A, mesmo sabendo o id', async () => {
  const r = await enviar(B.cookie(), 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', Buffer.from('x'));
  // 404, nao 403: dizer "existe, mas nao e sua" ja conta que aquele id existe.
  assert.strictEqual(r.status, 404);
});

test('formato fora da lista branca e recusado', async () => {
  const r = await enviar(A.cookie(), 'vistoria=v1&ambiente=0&tipo=foto', 'application/pdf', Buffer.from('%PDF-'));
  assert.ok(r.status === 415 || r.status === 400, 'PDF nao e foto: ' + r.status);
});

test('video mandado como foto e recusado', async () => {
  const r = await enviar(A.cookie(), 'vistoria=v1&ambiente=0&tipo=foto', 'video/webm', Buffer.from('x'));
  assert.strictEqual(r.status, 415, 'o tipo declarado e o mime tem que combinar');
});

test('acima do teto da foto e recusado', async () => {
  const grande = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
  const r = await enviar(A.cookie(), 'vistoria=v1&ambiente=0&tipo=foto', 'image/jpeg', grande);
  assert.strictEqual(r.status, 413);
});

test('estourar a quantidade por ambiente e recusado', async () => {
  await A('PUT', '/api/inspections/v-cheio', { id: 'v-cheio', tipo: 'Entrada', rooms: [{ nome: 'Sala' }] });
  for (let i = 0; i < 2; i++) {
    const ok = await enviar(A.cookie(), 'vistoria=v-cheio&ambiente=0&tipo=video', 'video/webm', Buffer.from('v' + i));
    assert.strictEqual(ok.status, 201, 'os dois primeiros videos entram');
  }
  const terceiro = await enviar(A.cookie(), 'vistoria=v-cheio&ambiente=0&tipo=video', 'video/webm', Buffer.from('v3'));
  assert.strictEqual(terceiro.status, 409, 'o terceiro video no mesmo ambiente nao entra');
});

test('lista as midias da vistoria, e so as da conta', async () => {
  const r = await A('GET', '/api/midias?vistoria=v1');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.dados.length, 1, 'a foto que subiu esta la');
  assert.strictEqual(r.dados[0].tipo, 'foto');
  assert.strictEqual(r.dados[0].bytes, 17);

  const deB = await B('GET', '/api/midias?vistoria=v1');
  assert.deepStrictEqual(deB.dados, [], 'B nao enxerga a midia da vistoria de A');
});

test('o arquivo volta com os bytes e o mime que subiram', async () => {
  const id = (await A('GET', '/api/midias?vistoria=v1')).dados[0].id;
  const r = await fetch(base + '/api/midias/' + id + '/arquivo', { headers: { Cookie: A.cookie() } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('content-type').split(';')[0], 'image/jpeg');
  assert.strictEqual(await r.text(), 'fingindo-ser-jpeg');

  const semSessao = await fetch(base + '/api/midias/' + id + '/arquivo');
  assert.strictEqual(semSessao.status, 401, 'arquivo de midia nao e publico');

  const deB = await fetch(base + '/api/midias/' + id + '/arquivo', { headers: { Cookie: B.cookie() } });
  assert.strictEqual(deB.status, 404, 'nem para outra conta que saiba o id');
});

test('apagar a midia leva o arquivo do disco junto', async () => {
  const { db, PASTA_UPLOADS } = require('./db');
  const id = (await A('GET', '/api/midias?vistoria=v1')).dados[0].id;
  const arquivo = db.prepare('select arquivo from midias where id = ?').get(id).arquivo;
  assert.ok(fs.existsSync(path.join(PASTA_UPLOADS, arquivo)));

  assert.strictEqual((await B('DELETE', '/api/midias/' + id)).status, 404, 'B nao apaga midia de A');
  assert.strictEqual((await A('DELETE', '/api/midias/' + id)).status, 200);

  assert.strictEqual(fs.existsSync(path.join(PASTA_UPLOADS, arquivo)), false,
    'linha apagada sem arquivo apagado e lixo que ninguem mais alcanca');
});

test('a varredura recolhe arquivo orfao', async () => {
  const { PASTA_UPLOADS } = require('./db');
  const orfao = path.join(PASTA_UPLOADS, 'orfao-de-teste.jpg');
  fs.writeFileSync(orfao, 'sem linha no banco');
  assert.ok(fs.existsSync(orfao));

  await A('GET', '/api/midias?vistoria=v1');   // a leitura varre

  assert.strictEqual(fs.existsSync(orfao), false,
    'e assim que o arquivo da vistoria apagada some — a cascata do SQLite nao alcanca o disco');
});

test('nao-admin recebe 403 nas rotas de administracao', async () => {
  for (const rota of ['users', 'contracts', 'profiles']) {
    assert.strictEqual((await B('GET', `/api/admin/${rota}`)).status, 403);
  }
});

test('admin le contratos de todos, mas cloud_key NUNCA sai', async () => {
  const r = await A('GET', '/api/admin/contracts');
  assert.strictEqual(r.status, 200);
  assert.ok(r.dados.length >= 1);
  for (const c of r.dados) {
    // cloud_key e a chave AES dos links do inquilino: com ela e o id, qualquer
    // um decifra o contrato. Era o motivo da migration 002 no Postgres.
    assert.ok(!('cloud_key' in c), 'cloud_key vazou para a tela de admin');
    assert.strictEqual(typeof c.fields, 'object');
  }
});

test('admin NAO enxerga o ERP', async () => {
  // Decisao registrada na Parte III do ARQUITETURA: supervisao de contas nao e
  // acesso ao negocio alheio. Nao ha rota de admin para imovel, cliente,
  // financeiro ou vistoria — e a ausencia e o teste.
  for (const r of ['properties', 'clients', 'financial_records', 'inspections']) {
    assert.strictEqual((await A('GET', `/api/admin/${r}`)).status, 404);
  }
});

// ── Conta ───────────────────────────────────────────────────────────────

test('excluir conta exige a senha certa e leva os dados junto', async () => {
  const c = cliente();
  await c('POST', '/api/auth/registrar', { email: 'sai@teste.com', senha: 'segredo123' });
  await c('PUT', '/api/properties/p-sai', { id: 'p-sai', name: 'Imovel', address: 'Rua X' });

  assert.strictEqual((await c('DELETE', '/api/auth/conta', { senha: 'errada' })).status, 401);
  assert.strictEqual((await c('GET', '/api/properties')).dados.length, 1, 'nada foi apagado');

  assert.strictEqual((await c('DELETE', '/api/auth/conta', { senha: 'segredo123' })).status, 200);

  const { db } = require('./db');
  assert.strictEqual(db.prepare('select count(*) n from users where email = ?').get('sai@teste.com').n, 0);
  assert.strictEqual(db.prepare('select count(*) n from properties where id = ?').get('p-sai').n, 0,
    'on delete cascade leva o ERP junto');
});

test('trocar a senha derruba as OUTRAS sessoes, nao a atual', async () => {
  const c1 = cliente();
  const c2 = cliente();
  await c1('POST', '/api/auth/registrar', { email: 'troca@teste.com', senha: 'senhavelha1' });
  await c2('POST', '/api/auth/entrar', { email: 'troca@teste.com', senha: 'senhavelha1' });

  assert.strictEqual((await c2('GET', '/api/contracts')).status, 200, 'c2 estava logado');

  assert.strictEqual((await c2('PUT', '/api/auth/senha', { senha: 'senhanova1' })).status, 200);
  assert.strictEqual((await c2('GET', '/api/contracts')).status, 200, 'quem trocou continua dentro');
  assert.strictEqual((await c1('GET', '/api/contracts')).status, 401, 'a outra sessao caiu');
});

// ── Servico de arquivos ─────────────────────────────────────────────────

test('rota de API desconhecida responde JSON, nao HTML', async () => {
  const r = await fetch(base + '/api/coisa-que-nao-existe');

  // 401 e nao 404: o router de recursos exige sessao antes de decidir se o
  // caminho existe. E o comportamento certo — responder 404 aqui e 401 nas
  // rotas reais diria a um anonimo quais rotas existem.
  assert.strictEqual(r.status, 401);

  // O que este teste realmente protege: um caminho errado nao pode devolver o
  // index.html com status 200. O front faria JSON.parse numa pagina inteira e o
  // erro nao diria nada sobre o que aconteceu.
  assert.match(r.headers.get('content-type') || '', /json/);

  // Logado, o mesmo caminho vira 404 de verdade — coberto tambem pelo teste da
  // lista branca de recursos.
  const logado = await A('GET', '/api/coisa-que-nao-existe');
  assert.strictEqual(logado.status, 404);
  assert.strictEqual(logado.dados.erro, 'Recurso desconhecido.');
});

test('/c serve o app -- e o endereco dos links de inquilino', async () => {
  // Utils.shareBaseUrl monta `origin + '/c'` em producao. Isto era um rewrite
  // do vercel.json; com ele apagado, sem esta rota TODO link gerado daria 404.
  const r = await fetch(base + '/c');
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('MEUS IMÓVEIS APP'));
});

test('o front e servido e vem com os cabecalhos de seguranca', async () => {
  const r = await fetch(base + '/app.html');
  assert.strictEqual(r.status, 200);
  // Estes vinham do vercel.json. Sumiram com ele e nao podiam sumir: o
  // X-Frame-Options e quem barra clickjacking, ja que `frame-ancestors` por
  // <meta> o navegador ignora.
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok((await r.text()).includes('MEUS IMÓVEIS APP'));
});
