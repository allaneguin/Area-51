// Reparo pontual — reconstroi o contrato a partir do link do inquilino.
// Rodar com o servidor PARADO:  node reparo-contrato-copia.js [idDoContrato]
//
// Existe por causa do bug do created_at (ver CHANGELOG 2026-08-27): sem
// cloud_id gravado, a importacao criava um contrato NOVO so com os campos do
// inquilino, em vez de atualizar o do locador. Quem apagasse o original ficava
// so com essa copia pela metade.
//
// O conserto nao inventa dado: o payload cifrado do link (tenant_links) guarda
// o contrato como o inquilino leu e assinou — locador, imovel, prazo, valor e
// as duas assinaturas. A chave esta na propria linha do contrato (cloud_key),
// entao da para decifrar e regravar tudo. O carimbo do aceite continua vindo
// do servidor, nunca do payload.
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'data.db'));

const id = process.argv[2];
const c = id
  ? db.prepare('select * from contracts where id = ?').get(id)
  : db.prepare('select * from contracts where cloud_id is not null order by updated_at desc').get();
if (!c) throw new Error('Contrato nao encontrado.');
if (!c.cloud_id || !c.cloud_key) throw new Error('Este contrato nao tem link do inquilino para reconstruir.');

const link = db.prepare('select * from tenant_links where id = ?').get(c.cloud_id);
if (!link) throw new Error('O link ja expirou e foi apagado do servidor — nao ha de onde reconstruir.');

// Mesmo formato do CloudDB do navegador: chave em texto ajustada a 32 bytes,
// AES-256-GCM, iv nos 12 primeiros bytes, base64 url-safe.
let b64 = link.encrypted_payload.replace(/-/g, '+').replace(/_/g, '/');
while (b64.length % 4) b64 += '=';
const buf = Buffer.from(b64, 'base64');
const chave = Buffer.alloc(32);
Buffer.from(String(c.cloud_key), 'utf8').copy(chave);
const d = crypto.createDecipheriv('aes-256-gcm', chave, buf.subarray(0, 12));
d.setAuthTag(buf.subarray(buf.length - 16));
const payload = JSON.parse(
  Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString('utf8'));

const campos = { ...payload.f };
// Carimbo do servidor vence o autodeclarado — mesma regra da ingestao na tela.
if (link.finalized_at) {
  campos.aceite_ts_servidor = link.finalized_at;
  campos.ip_servidor = link.finalized_ip || '';
}

db.prepare(`update contracts
  set name = ?, template_id = ?, fields = ?, is_finalized = ?, updated_at = ?
  where id = ?`).run(
  'Locação de Imóvel Residencial - ' + (campos.nome_locatario || 'Inquilino'),
  payload.t, JSON.stringify(campos), link.finalized ? 1 : 0,
  new Date().toISOString(), c.id);

console.log(`Reconstruido ${c.id}: ${Object.keys(campos).length} campos.`);
console.log(db.prepare('select id, name, is_finalized from contracts').all());
console.log('\nRecarregue a pagina do painel.');
