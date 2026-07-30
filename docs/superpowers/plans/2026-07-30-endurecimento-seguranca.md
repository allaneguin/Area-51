# Endurecimento de Segurança — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o acesso anônimo direto à tabela `tenant_links` e neutralizar o XSS armazenado do inquilino para a sessão do locador, antes de colocar clientes pagantes no sistema.

**Architecture:** O visitante anônimo deixa de ter acesso direto à tabela e passa a falar exclusivamente com as três funções `SECURITY DEFINER`, que já filtram por identificador. Em paralelo, todo dado controlado pelo inquilino é validado na única porta por onde entra — a descriptografia em `js/database.js` — em vez de tela a tela.

**Tech Stack:** JavaScript vanilla (sem build, objetos globais em `window`), PostgreSQL/Supabase (RLS + funções plpgsql), testes em Node com `assert` e o padrão `new Function()` já usado no repositório.

**Spec:** [`docs/superpowers/specs/2026-07-30-seguranca-endurecimento-design.md`](../specs/2026-07-30-seguranca-endurecimento-design.md)

## Global Constraints

- **Sem framework, sem build, sem dependência nova.** O projeto é servido como arquivos estáticos; nada de npm install.
- **Teto de payload: 524288 bytes (512 KB).** Este número exato aparece em três lugares (constraint da tabela, `create_tenant_link`, `set_tenant_link`) e precisa ser idêntico nos três.
- **Retenção: 30 dias.** Tanto o padrão de link não assinado quanto a janela após finalização.
- **Teto de criação: 100 links por dia por usuário.**
- **Todo SQL é idempotente.** Rodar duas vezes não pode dar erro — é a única defesa contra a divergência que já existe entre os três scripts atuais.
- **Comentários e mensagens de erro em português**, seguindo o código existente.
- **Ao final, subir a versão dos assets** de `?v=1.25.0` para `?v=1.26.0` em `app.html`. Sem isso o navegador dos clientes serve o JavaScript antigo e as correções não chegam.
- **Nunca escapar duas vezes.** `Utils.esc` só entra onde o valor vai para `innerHTML`; onde já se usa `textContent`, não mexer.

## Pré-requisito bloqueante (Fase 0)

As Tasks 3, 4 e 6 dependem da saída de `supabase_diagnostico.sql`, rodada no SQL Editor do Supabase. Dois pontos concretos:

1. **Consulta 8 — `maior_payload_bytes`.** Se algum registro existente passar de 524288, a constraint da Task 3 falha ao ser criada. Nesse caso, apagar/expirar os registros gigantes antes, ou criar a constraint como `not valid`.
2. **Consulta 7 — `extensao_pg_cron_instalada`.** Decide o caminho da Task 6 (job agendado ou expurgo oportunista).

**Tasks 1, 2 e 7 não dependem do diagnóstico e podem ser feitas imediatamente.**

---

## File Structure

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `js/database.js` | Criptografia e acesso ao link. Ganha a validação de fronteira; perde o retorno silencioso. | 1, 5 |
| `js/seguranca.test.js` | **Novo.** Prova que o sanitizador aceita imagem legítima e rejeita as formas de injeção. | 1 |
| `js/editor.js` | Painel do locador. Escape em 2 interpolações de texto. | 2 |
| `js/tenant-v2.js` | Tela do inquilino. Escape em 2 interpolações; aviso de coleta antes do envio. | 2, 7 |
| `js/utils.js` | Certificado do PDF. Escape em 1 interpolação. | 2 |
| `supabase_seguranca.sql` | **Novo.** A cerca consolidada: fecha o acesso direto, exige sessão, impõe tetos, unifica `set_tenant_link`, ajusta retenção. Substitui a divergência dos três scripts atuais. | 3 |
| `supabase_verificacao.sql` | **Novo.** Falha ruidosamente se qualquer garantia da Task 3 não estiver de pé. | 4 |
| `app.html` | Versão dos assets. | 8 |

---

### Task 1: Sanitizar o dado do inquilino na fronteira

**Por que primeiro:** é a correção de maior gravidade que não depende do diagnóstico. Hoje um inquilino de má-fé executa código na sessão logada do locador, com acesso aos dados de todos os clientes dele.

**Files:**
- Modify: `js/database.js` (adicionar métodos ao objeto `CloudDB`; chamar em `decrypt`)
- Create: `js/seguranca.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `CloudDB._IMG_OK` (RegExp), `CloudDB._sanitizeValue(v) -> any`, `CloudDB._sanitizeDeep(node, depth) -> void`. A Task 5 mexe no mesmo arquivo mas em outra função (`updateContract`) — não há conflito.

- [ ] **Step 1: Escrever o teste que falha**

Criar `js/seguranca.test.js`:

```js
// Check da sanitizacao de fronteira: o payload do link e montado por quem tem
// a chave (inclusive o inquilino) e volta para dentro da sessao do locador.
// Rodar: node js/seguranca.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// database.js e script de browser (global), nao modulo: avalia e pega o global.
const src = fs.readFileSync(path.join(__dirname, 'database.js'), 'utf8');
const CloudDB = new Function(`${src}; return CloudDB;`)();

// ── data-URL de imagem legitima passa intacta ──
const pngOk = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const jpgOk = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';
assert.strictEqual(CloudDB._sanitizeValue(pngOk), pngOk, 'PNG legitimo deve passar');
assert.strictEqual(CloudDB._sanitizeValue(jpgOk), jpgOk, 'JPEG legitimo deve passar');

// ── quebra de atributo: o vetor real do ataque ──
assert.strictEqual(
  CloudDB._sanitizeValue('data:image/png;base64,AAAA" onerror="alert(1)'),
  '', 'aspas no meio do base64 devem zerar o campo');
assert.strictEqual(
  CloudDB._sanitizeValue('data:image/png;base64,AAAA"><script>alert(1)</script>'),
  '', 'fechamento de tag deve zerar o campo');

// ── outros esquemas data: nao sao imagem ──
assert.strictEqual(CloudDB._sanitizeValue('data:text/html;base64,PHNjcmlwdD4='), '');
assert.strictEqual(CloudDB._sanitizeValue('data:image/svg+xml;base64,PHN2Zz4='), '',
  'SVG carrega script: fora da lista permitida');

// ── javascript: disfarcado ──
assert.strictEqual(CloudDB._sanitizeValue('javascript:alert(1)'), 'javascript:alert(1)',
  'nao comeca com data:, sai intacto — quem protege esse caso e o escape no sink');

// ── texto comum nao pode ser tocado ──
assert.strictEqual(CloudDB._sanitizeValue('Maria Silva'), 'Maria Silva');
assert.strictEqual(CloudDB._sanitizeValue('R$ 1.500,00'), 'R$ 1.500,00');
assert.strictEqual(CloudDB._sanitizeValue(''), '');
assert.strictEqual(CloudDB._sanitizeValue(42), 42, 'nao-string sai como veio');
assert.strictEqual(CloudDB._sanitizeValue(null), null);

// ── varredura profunda: e assim que o payload real chega ──
const payload = {
  t: 'residencial',
  f: {
    nome_locatario: 'Maria Silva',
    assinatura_locatario: pngOk,
    selfie_locatario: 'data:image/png;base64,XX" onerror="fetch(1)',
    aninhado: { assinatura_locador: 'data:text/html;base64,PHN2Zz4=' }
  }
};
CloudDB._sanitizeDeep(payload);
assert.strictEqual(payload.f.nome_locatario, 'Maria Silva', 'texto preservado');
assert.strictEqual(payload.f.assinatura_locatario, pngOk, 'imagem valida preservada');
assert.strictEqual(payload.f.selfie_locatario, '', 'injecao zerada');
assert.strictEqual(payload.f.aninhado.assinatura_locador, '', 'varre objeto aninhado');

// ── ciclo nao pode travar a varredura ──
const ciclico = { a: {} };
ciclico.a.volta = ciclico;
CloudDB._sanitizeDeep(ciclico); // se estourar a pilha, o teste falha aqui

console.log('ok — seguranca: sanitizacao de fronteira do payload do inquilino');
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node js/seguranca.test.js`
Expected: FAIL com `TypeError: CloudDB._sanitizeValue is not a function`

- [ ] **Step 3: Implementar o sanitizador**

Em `js/database.js`, inserir logo após o método `_base64ToUint8` (linha 45), antes de `encrypt`:

```js
  // ── Sanitização de fronteira ────────────────────────────────────────────
  // O payload do link é montado por quem tem a chave — inclusive o inquilino —
  // e volta para dentro da sessão logada do locador. Vários pontos de exibição
  // jogam esses campos em innerHTML (assinaturas, selfie), e a CSP não pode
  // servir de rede: o app depende de ~85 handlers inline, então 'unsafe-inline'
  // continua ligado. Por isso a validação acontece aqui, na única porta de
  // entrada, e não em cada tela — uma tela esquecida seria a brecha inteira.

  // Só as três formas que o próprio fluxo gera (canvas.toDataURL e câmera).
  // SVG fica de fora de propósito: carrega script.
  _IMG_OK: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/,

  _sanitizeValue(v) {
    if (typeof v !== 'string') return v;
    // Só entra na peneira o que se apresenta como data: — texto comum passa livre.
    if (!/^\s*data:/i.test(v)) return v;
    return this._IMG_OK.test(v) ? v : '';
  },

  _sanitizeDeep(node, depth = 0, vistos = null) {
    if (node === null || typeof node !== 'object') return;
    if (depth > 12) return;
    vistos = vistos || new Set();
    if (vistos.has(node)) return; // payload com ciclo não pode travar o carregamento
    vistos.add(node);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') node[k] = this._sanitizeValue(v);
      else if (v !== null && typeof v === 'object') this._sanitizeDeep(v, depth + 1, vistos);
    }
  },
```

- [ ] **Step 4: Ligar o sanitizador na descriptografia**

Em `js/database.js`, no método `decrypt`, trocar a linha 82:

```js
    return JSON.parse(new TextDecoder().decode(decrypted));
```

por:

```js
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    // Passa a peneira antes de qualquer tela ver o dado.
    this._sanitizeDeep(payload);
    return payload;
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `node js/seguranca.test.js`
Expected: PASS — `ok — seguranca: sanitizacao de fronteira do payload do inquilino`

- [ ] **Step 6: Rodar a suíte inteira para confirmar que nada quebrou**

Run: `node js/dashboard.test.js && node js/prazo.test.js && node js/superadmin.test.js && node js/properties.test.js && node js/seguranca.test.js`
Expected: cinco linhas `ok — ...`, sem exceção.

- [ ] **Step 7: Commit**

```bash
git add js/database.js js/seguranca.test.js
git commit -m "fix(seguranca): valida dado do inquilino na fronteira, nao tela a tela

O payload do link e montado por quem tem a chave e volta para dentro da
sessao logada do locador. Campos de assinatura e selfie entram em
innerHTML sem escape em seis pontos, e a CSP nao serve de rede: ~85
handlers inline mantem unsafe-inline ligado. Um valor como
data:image/png;base64,AAAA\" onerror=\"... executava na sessao do locador,
com acesso aos dados de todos os clientes dele.

Validacao passa a acontecer na descriptografia, porta unica por onde o
dado entra: campo que se apresenta como data: precisa casar com imagem
base64 legitima, senao vira string vazia. Cobre os seis pontos de hoje e
os que forem escritos amanha."
```

---

### Task 2: Escapar as interpolações de texto que viram HTML

**Por que separado da Task 1:** o sanitizador cuida de `data:`; estes cinco pontos são texto livre indo direto para `innerHTML`. São classes diferentes de problema e um revisor pode aceitar uma e rejeitar a outra.

**Files:**
- Modify: `js/editor.js:513-518`
- Modify: `js/tenant-v2.js:550-555`
- Modify: `js/utils.js:701`

**Interfaces:**
- Consumes: `Utils.esc(v) -> string` (já existe em `js/utils.js:211`).
- Produces: nada.

- [ ] **Step 1: Corrigir `js/editor.js`**

Trocar o bloco da garantia (linhas 511-518) para escapar os quatro valores:

```js
      if (tipoGarantia === 'caucao') {
        const v = Utils.esc(this.contract.fields.valor_caucao || 'R$ ___');
        const ve = Utils.esc(this.contract.fields.valor_caucao_extenso || '___');
        txtGarantia.innerHTML = `Para garantia das obrigações assumidas neste contrato, o LOCATÁRIO presta garantia mediante <strong>Caução em Dinheiro</strong> no valor de <strong>${v} (${ve})</strong>, depositada em favor do LOCADOR.`;
      } else if (tipoGarantia === 'fiador') {
        const nf = Utils.esc(this.contract.fields.nome_fiador || '___');
        const df = Utils.esc(this.contract.fields.doc_fiador || '___');
        txtGarantia.innerHTML = `Para garantia das obrigações assumidas neste contrato, assina como <strong>FIADOR(A)</strong> e principal pagador(a) solidário(a) o(a) Sr(a). <strong>${nf}</strong>, CPF <strong>${df}</strong>.`;
      } else {
```

- [ ] **Step 2: Corrigir `js/tenant-v2.js`**

O bloco em `js/tenant-v2.js:548-555` é idêntico ao do editor. Aplicar exatamente a mesma troca: envolver `valor_caucao`, `valor_caucao_extenso`, `nome_fiador` e `doc_fiador` em `Utils.esc(...)`, mantendo os fallbacks `'R$ ___'` e `'___'` dentro da chamada.

- [ ] **Step 3: Corrigir `js/utils.js`**

Na linha 701, o hash é o único valor da tabela do certificado sem escape — `ip`, `gpsStr` e `userAgent` ao redor já usam `Utils.esc`. Trocar:

```js
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px; font-family: monospace; font-size: 8.5pt; word-break: break-all;">${hashDoc}</td>
```

por:

```js
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px; font-family: monospace; font-size: 8.5pt; word-break: break-all;">${Utils.esc(hashDoc)}</td>
```

- [ ] **Step 4: Confirmar que não sobrou nenhum ponto**

Run:
```bash
grep -n 'innerHTML = `' js/editor.js js/tenant-v2.js | grep -v 'Utils.esc' | grep '\${'
```
Expected: só as linhas de assinatura (`signature-img-container`), que são cobertas pela Task 1, e nenhuma linha com valor de texto cru.

- [ ] **Step 5: Rodar a suíte**

Run: `node js/dashboard.test.js && node js/prazo.test.js && node js/superadmin.test.js && node js/properties.test.js && node js/seguranca.test.js`
Expected: cinco `ok — ...`.

- [ ] **Step 6: Commit**

```bash
git add js/editor.js js/tenant-v2.js js/utils.js
git commit -m "fix(seguranca): escapa caucao, fiador e hash antes de virarem HTML

Cinco interpolacoes de texto entravam em innerHTML sem tratamento:
valor e extenso da caucao e nome e documento do fiador, no editor e na
tela do inquilino, mais o hash de aceite no certificado do PDF. No
certificado o hash era o unico campo sem escape — ip, gps e userAgent ao
redor ja usavam Utils.esc.

Sao campos que o inquilino controla via payload, entao a correcao fecha
a segunda metade do XSS armazenado (a primeira, dos campos data:, esta
na sanitizacao de fronteira)."
```

---

### Task 3: A cerca do banco

**Bloqueada pela Fase 0.** Não começar sem a saída de `supabase_diagnostico.sql`.

**Files:**
- Create: `supabase_seguranca.sql`

**Interfaces:**
- Consumes: tabela `public.tenant_links` com colunas `id uuid`, `encrypted_payload text`, `finalized boolean`, `created_at timestamptz`, `expires_at timestamptz` (confirmadas no DDL em `supabase_schema.sql:73-79`).
- Produces: `create_tenant_link(p_id uuid, p_payload text) -> uuid` (só `authenticated`), `set_tenant_link(p_id text, p_payload text, p_finalize boolean default false) -> boolean` (assinatura única), coluna `tenant_links.created_by uuid`.

- [ ] **Step 1: Conferir o diagnóstico antes de escrever**

Duas checagens na saída colada:
- Consulta 8, `maior_payload_bytes` ≤ 524288? Se não, a constraint do Step 2 falha. Nesse caso, primeiro rodar `delete from public.tenant_links where length(encrypted_payload) > 524288;` (são links inutilizáveis de qualquer forma) e registrar quantos foram.
- Consulta 2: quantas assinaturas de `set_tenant_link` existem? Todas precisam entrar nos `drop` do Step 4.

- [ ] **Step 2: Escrever `supabase_seguranca.sql`**

```sql
-- =========================================================================
-- CERCA DE SEGURANÇA — consolida e substitui as regras de tenant_links que
-- estavam divididas (e divergentes) entre supabase_schema.sql,
-- supabase_rls.sql e supabase_finalize.sql.
--
-- Princípio: o visitante anônimo não fala mais com a tabela, só com as três
-- funções SECURITY DEFINER, que filtram por identificador. As funções rodam
-- com privilégio de dono, então continuam funcionando com a tabela fechada.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- =========================================================================

-- ── 1. Fechar a porta direta ─────────────────────────────────────────────
-- A regra de leitura era "devolva se não expirou", SEM filtro por id: a
-- tabela inteira era listável com a chave pública. A de escrita era
-- `with check (true)`: dava para sobrescrever qualquer link e até reverter
-- a trava de finalizado. Nenhum código do app consulta a tabela direto.
drop policy if exists "tenant_links_select_by_id" on public.tenant_links;
drop policy if exists "tenant_links_insert"       on public.tenant_links;
drop policy if exists "tenant_links_update_by_id" on public.tenant_links;

revoke all on table public.tenant_links from anon, authenticated;

-- RLS ligada e zero policies = negado por padrão para quem não é dono.
alter table public.tenant_links enable row level security;

-- ── 2. Teto de tamanho, imposto pelo banco ───────────────────────────────
-- Vale para qualquer caminho, inclusive quem chamar a função direto sem
-- passar pelo app. Referência: selfie 600px (~40-80 KB) + duas assinaturas
-- PNG (~5-20 KB) + campos, cifrado e em base64, fica na casa de 200 KB.
alter table public.tenant_links drop constraint if exists tenant_links_payload_max;
alter table public.tenant_links
  add constraint tenant_links_payload_max
  check (length(encrypted_payload) <= 524288);

-- ── 3. Dono do link ──────────────────────────────────────────────────────
-- Habilita o teto por usuário abaixo, o expurgo em cascata quando a conta
-- é excluída, e (no futuro) o locador revogar os próprios links.
alter table public.tenant_links
  add column if not exists created_by uuid references auth.users(id) on delete cascade;

create index if not exists tenant_links_created_by_idx
  on public.tenant_links (created_by, created_at desc);

-- ── 4. Criar link exige sessão ───────────────────────────────────────────
drop function if exists public.create_tenant_link(uuid, text);
drop function if exists public.create_tenant_link(text, text);

create function public.create_tenant_link(p_id uuid, p_payload text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_hoje integer;
begin
  -- O app só cria link de dentro do editor, sempre logado. A permissão para
  -- anônimo era herança morta — e permitia encher o banco de graça.
  if v_uid is null then
    raise exception 'Sessão necessária para gerar link do inquilino'
      using errcode = '42501';
  end if;

  if length(p_payload) > 524288 then
    raise exception 'Conteúdo do link acima do limite de 512 KB'
      using errcode = '22001';
  end if;

  -- Disjuntor, não cota comercial: 100/dia é muito acima do uso real de um
  -- escritório e pega conta comprometida ou laço infinito no cliente.
  select count(*) into v_hoje
    from public.tenant_links
   where created_by = v_uid
     and created_at > now() - interval '1 day';

  if v_hoje >= 100 then
    raise exception 'Limite de 100 links por dia atingido. Tente novamente amanhã.'
      using errcode = '54000';
  end if;

  insert into public.tenant_links (id, encrypted_payload, created_by)
  values (p_id, p_payload, v_uid);

  return p_id;
end;
$$;

revoke all on function public.create_tenant_link(uuid, text) from public, anon;
grant execute on function public.create_tenant_link(uuid, text) to authenticated;

-- ── 5. set_tenant_link: uma assinatura só ────────────────────────────────
-- Existiam versões com p_id uuid e p_id text; a coluna é uuid mas o cliente
-- manda string, e a versão uuid causou "operator does not exist: text = uuid"
-- em produção. id::text = p_id funciona nos dois casos.
drop function if exists public.set_tenant_link(uuid, text);
drop function if exists public.set_tenant_link(text, text);
drop function if exists public.set_tenant_link(uuid, text, boolean);
drop function if exists public.set_tenant_link(text, text, boolean);

create function public.set_tenant_link(
  p_id       text,
  p_payload  text,
  p_finalize boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_payload) > 524288 then
    raise exception 'Conteúdo do link acima do limite de 512 KB'
      using errcode = '22001';
  end if;

  update public.tenant_links
     set encrypted_payload = p_payload,
         finalized         = finalized or p_finalize,
         -- Ao assinar, a janela cai para 30 dias: tempo de o locador
         -- importar o contrato. Depois disso selfie, documento, IP e
         -- coordenada somem do servidor (ficam no contrato e no PDF).
         expires_at        = case
                               when p_finalize then least(expires_at, now() + interval '30 days')
                               else expires_at
                             end
   where id::text = p_id
     and expires_at > now()
     and not finalized;

  return found;
end;
$$;

revoke all on function public.set_tenant_link(text, text, boolean) from public;
grant execute on function public.set_tenant_link(text, text, boolean) to anon, authenticated;

-- ── 6. Retenção padrão: 90 → 30 dias ─────────────────────────────────────
-- Link não assinado carrega CPF, RG e dados bancários do locador. Não há
-- motivo para três meses. Só afeta links novos.
alter table public.tenant_links
  alter column expires_at set default (now() + interval '30 days');
```

- [ ] **Step 3: Aplicar no Supabase**

Colar o arquivo inteiro no SQL Editor e executar. Depois **rodar de novo** — tem que passar sem erro nas duas vezes (é o teste de idempotência).
Expected: `Success. No rows returned` nas duas execuções.

- [ ] **Step 4: Commit**

```bash
git add supabase_seguranca.sql
git commit -m "feat(seguranca): fecha acesso anonimo direto a tenant_links

A regra de leitura era 'devolva se nao expirou', sem filtro por id: a
tabela inteira era listavel com a chave publica, que e publica por
design. A de escrita era with check (true), entao com um id em maos dava
para sobrescrever qualquer contrato em andamento e reverter a trava de
finalizado. Criar linha estava concedido ao papel anonimo, sem teto de
tamanho — no Free tier, o jeito mais barato de derrubar o sistema.

Anonimo passa a falar so com as tres funcoes SECURITY DEFINER, que ja
filtram por id. Criar exige sessao e grava dono; teto de 512 KB no banco;
set_tenant_link com assinatura unica (a duplicata uuid/text causou
'operator does not exist' em producao); retencao 90 -> 30 dias.

Consolida e substitui as regras divergentes de supabase_schema.sql,
supabase_rls.sql e supabase_finalize.sql."
```

---

### Task 4: Provar que a cerca está de pé

**Files:**
- Create: `supabase_verificacao.sql`

**Interfaces:**
- Consumes: tudo que a Task 3 produziu.
- Produces: nada (script de verificação).

- [ ] **Step 1: Escrever `supabase_verificacao.sql`**

```sql
-- =========================================================================
-- VERIFICAÇÃO — roda depois de supabase_seguranca.sql.
-- Falha ruidosamente se alguma garantia não estiver de pé.
-- Segurança sem prova de que funciona é suposição.
-- =========================================================================
do $$
declare
  v_qtd integer;
  v_txt text;
begin
  -- 1. Nenhuma policy alcançando anon em tenant_links.
  select count(*) into v_qtd
    from pg_policies
   where schemaname = 'public' and tablename = 'tenant_links'
     and roles::text like '%anon%';
  if v_qtd > 0 then
    raise exception 'FALHA 1: ainda existem % policy(s) para anon em tenant_links', v_qtd;
  end if;

  -- 2. Nenhuma permissão direta de tabela para anon/authenticated.
  select count(*) into v_qtd
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'tenant_links'
     and grantee in ('anon', 'authenticated');
  if v_qtd > 0 then
    raise exception 'FALHA 2: anon/authenticated ainda tem % permissao(oes) diretas em tenant_links', v_qtd;
  end if;

  -- 3. RLS ligada na tabela.
  if not exists (select 1 from pg_class
                  where oid = 'public.tenant_links'::regclass and relrowsecurity) then
    raise exception 'FALHA 3: RLS desligada em tenant_links';
  end if;

  -- 4. create_tenant_link fora do alcance do anonimo.
  select count(*) into v_qtd
    from information_schema.routine_privileges g
    join information_schema.routines r on r.specific_name = g.specific_name
   where r.specific_schema = 'public'
     and r.routine_name = 'create_tenant_link'
     and g.grantee in ('anon', 'PUBLIC');
  if v_qtd > 0 then
    raise exception 'FALHA 4: create_tenant_link ainda executavel por anon/PUBLIC';
  end if;

  -- 5. Teto de tamanho presente.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.tenant_links'::regclass
                    and conname = 'tenant_links_payload_max') then
    raise exception 'FALHA 5: constraint tenant_links_payload_max ausente';
  end if;

  -- 6. set_tenant_link com uma assinatura so.
  select count(*) into v_qtd
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_tenant_link';
  if v_qtd <> 1 then
    raise exception 'FALHA 6: set_tenant_link tem % assinaturas (esperado 1)', v_qtd;
  end if;

  -- 7. Coluna de dono presente.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tenant_links'
                    and column_name = 'created_by') then
    raise exception 'FALHA 7: coluna created_by ausente';
  end if;

  -- 8. Retencao padrao de 30 dias.
  select column_default into v_txt
    from information_schema.columns
   where table_schema = 'public' and table_name = 'tenant_links'
     and column_name = 'expires_at';
  if v_txt not like '%30 days%' then
    raise exception 'FALHA 8: padrao de expires_at nao e 30 dias (esta: %)', v_txt;
  end if;

  -- 9. RLS ligada em todas as tabelas de dados do usuario.
  select count(*) into v_qtd
    from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'
     and relname in ('contracts','profiles','properties','clients','financial_records')
     and not relrowsecurity;
  if v_qtd > 0 then
    raise exception 'FALHA 9: % tabela(s) de usuario sem RLS', v_qtd;
  end if;

  raise notice 'OK — todas as 9 garantias de seguranca verificadas.';
end $$;
```

- [ ] **Step 2: Rodar no SQL Editor**

Expected: `OK — todas as 9 garantias de seguranca verificadas.` na aba de mensagens. Qualquer `FALHA n:` significa que a Task 3 não foi aplicada por inteiro — corrigir antes de seguir.

- [ ] **Step 3: Teste negativo real, com a chave pública**

Este é o teste que importa: prova que o furo fechou de fato, do lado de fora. No console do navegador, em qualquer aba (**deslogado**, ou aba anônima):

```js
const r = await fetch(
  'https://hbmqmzsssccrsyqdyixd.supabase.co/rest/v1/tenant_links?select=id&limit=5',
  { headers: { apikey: 'sb_publishable_zKudHzqDlkkSHp4Q5n7KrQ_wBW7mHFb' } }
);
console.log(r.status, await r.text());
```

Expected: status **401** ou **403** com mensagem de permissão negada.
Antes da Task 3 isso devolvia **200** com a lista de identificadores — é exatamente o furo que estava aberto.

- [ ] **Step 4: Commit**

```bash
git add supabase_verificacao.sql
git commit -m "test(seguranca): script que falha se alguma garantia cair

Nove asserts sobre o estado do banco: nenhuma policy ou permissao direta
para anon em tenant_links, RLS ligada, create_tenant_link fora do alcance
do anonimo, teto de tamanho presente, set_tenant_link com assinatura
unica, coluna de dono, retencao de 30 dias e RLS em todas as tabelas de
usuario. Serve para rodar depois de qualquer mexida futura no SQL."
```

---

### Task 5: Remover a degradação silenciosa da trava

**Depende da Task 3 aplicada.** Com a assinatura de três argumentos garantida no banco, o caminho de retorno perde a razão de existir.

**Files:**
- Modify: `js/database.js:135-149`

**Interfaces:**
- Consumes: `set_tenant_link(text, text, boolean)` da Task 3.
- Produces: nada.

- [ ] **Step 1: Entender o que se remove**

Hoje, se a função de três argumentos não existe (`PGRST202`), o cliente reenvia sem o parâmetro de finalização: o inquilino recebe "enviado com sucesso" e **o link continua gravável por qualquer um que tenha a URL**. O único sinal é um `console.warn` que ninguém lê e a flag `this.finalizeIndisponivel`, que não é consultada em lugar nenhum do código. É degradação silenciosa de segurança — falha que se disfarça de sucesso.

- [ ] **Step 2: Remover o bloco**

Em `js/database.js`, apagar as linhas 135-149 inteiras (do comentário `// Banco ainda sem a migração` até o fechamento do `if`), e trocar o `let` da linha 130 por `const`:

```js
    const { data, error } = await supabaseClient
      .rpc('set_tenant_link', finalize
        ? { p_id: serverId, p_payload: encryptedPayload, p_finalize: true }
        : { p_id: serverId, p_payload: encryptedPayload });

    if (error) throw new Error("Falha ao atualizar contrato no servidor: " + error.message);
```

- [ ] **Step 3: Confirmar que a flag não era usada em lugar nenhum**

Run: `grep -rn "finalizeIndisponivel" js/ *.html`
Expected: nenhum resultado. Se aparecer algum, remover também.

- [ ] **Step 4: Rodar a suíte**

Run: `node js/dashboard.test.js && node js/prazo.test.js && node js/superadmin.test.js && node js/properties.test.js && node js/seguranca.test.js`
Expected: cinco `ok — ...`.

- [ ] **Step 5: Commit**

```bash
git add js/database.js
git commit -m "fix(seguranca): falha da trava deixa de se disfarcar de sucesso

Se a funcao de tres argumentos nao existisse, o cliente reenviava sem o
parametro de finalizacao: o inquilino via 'enviado com sucesso' e o link
seguia gravavel por quem tivesse a URL. O unico sinal era um console.warn
e uma flag que nao era lida em lugar nenhum.

Com a assinatura unica garantida por supabase_seguranca.sql, o caminho
de retorno perde a razao de existir. Erro agora e erro visivel."
```

---

### Task 6: Expurgo automático dos links expirados

**Bloqueada pela Fase 0** (consulta 7 decide o caminho).

**Files:**
- Modify: `supabase_seguranca.sql` (acrescentar seção 7 ao final)

**Interfaces:**
- Consumes: `tenant_links.expires_at`.
- Produces: job `purge_expired_tenant_links` **ou** expurgo dentro de `get_tenant_link`.

- [ ] **Step 1: Escolher o caminho pela saída do diagnóstico**

Se `extensao_pg_cron_instalada = 1`, seguir o Step 2A. Se `0`, seguir o Step 2B.

- [ ] **Step 2A: Job agendado (pg_cron disponível)**

Acrescentar ao final de `supabase_seguranca.sql`:

```sql
-- ── 7. Expurgo diário dos expirados ──────────────────────────────────────
-- Sem isso, "retenção de 30 dias" é só uma data numa coluna: a linha, com
-- selfie, documento, IP e coordenada, continua no banco para sempre.
select cron.unschedule('purge_expired_tenant_links')
  where exists (select 1 from cron.job where jobname = 'purge_expired_tenant_links');

select cron.schedule(
  'purge_expired_tenant_links',
  '15 3 * * *',
  $$delete from public.tenant_links where expires_at < now()$$
);
```

Depois de aplicar, conferir: `select jobname, schedule, active from cron.job;`
Expected: uma linha com `purge_expired_tenant_links`, `15 3 * * *`, `active = true`.

- [ ] **Step 2B: Expurgo oportunista (pg_cron indisponível)**

Acrescentar ao final de `supabase_seguranca.sql`:

```sql
-- ── 7. Expurgo oportunista (sem pg_cron neste projeto) ───────────────────
-- Apaga expirados na leitura. Custa uma escrita no caminho de leitura, mas
-- sem isso "retenção de 30 dias" é só uma data numa coluna: a linha, com
-- selfie, documento, IP e coordenada, ficaria no banco para sempre.
create or replace function public.get_tenant_link(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload text;
begin
  delete from public.tenant_links where expires_at < now();

  select encrypted_payload into v_payload
    from public.tenant_links
   where id = p_id and expires_at > now();

  return v_payload;
end;
$$;

revoke all on function public.get_tenant_link(uuid) from public;
grant execute on function public.get_tenant_link(uuid) to anon, authenticated;
```

- [ ] **Step 3: Rodar `supabase_verificacao.sql` de novo**

Expected: `OK — todas as 9 garantias de seguranca verificadas.` (o Step 2B recria `get_tenant_link`; a verificação confirma que nada mais foi afetado).

- [ ] **Step 4: Commit**

```bash
git add supabase_seguranca.sql
git commit -m "feat(seguranca): expurgo automatico dos links expirados

Sem expurgo, 'retencao de 30 dias' e so uma data numa coluna: a linha,
com selfie, documento, IP e coordenada, ficaria no banco para sempre."
```

---

### Task 7: Avisar antes de coletar IP e localização

**Independe do diagnóstico.** Decisão registrada no spec: a coordenada fica com precisão máxima (6 casas, ~11 cm) pelo valor probatório — o que torna o aviso obrigatório, não opcional.

**Files:**
- Modify: `js/tenant-v2.js:221-225` (bloco do aceite)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Inserir o aviso acima da caixa de aceite**

Em `js/tenant-v2.js`, imediatamente antes da linha 221 (`<input type="checkbox" id="aceito_contrato"...`), inserir:

```js
        <div class="tenant-privacidade">
          <strong>Ao enviar, serão registrados junto com sua assinatura:</strong>
          data e hora, seu endereço IP, a localização aproximada do dispositivo
          e o navegador utilizado. Servem para comprovar quem aceitou o contrato,
          de onde e quando — é o que dá validade jurídica ao aceite eletrônico.
          Esses dados vão apenas para o locador deste contrato, junto com o
          contrato assinado.
        </div>

```

- [ ] **Step 2: Estilizar o aviso**

Acrescentar ao final de `css/tenant.css` (é onde vivem os outros estilos `.tenant-*`).

Os quatro tokens abaixo foram conferidos e existem em `css/index.css`. **Não trocar por `--text-primary`/`--text-secondary`: esses não existem neste projeto** — variável inexistente rende elemento sem estilo, que foi o que já aconteceu aqui com `--bg-card`.

```css
/* Aviso de coleta: precisa ser legível antes do aceite, não depois.
   Discreto o bastante para não competir com o contrato, visível o
   bastante para não parecer letra miúda escondida. */
.tenant-privacidade {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-muted);
  background: var(--seg-bg);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 0.75rem 0.9rem;
  margin-bottom: 1rem;
}
.tenant-privacidade strong { color: var(--text-main); }
```

- [ ] **Step 3: Conferir que o aviso funciona nos dois temas**

Run: `grep -n "text-muted\|text-main\|seg-bg\|border-light" css/index.css | grep -c "data-theme\|:root"`
Expected: valor maior que zero — os tokens são redefinidos no tema escuro, então o aviso acompanha sem CSS extra.

- [ ] **Step 4: Conferir visualmente**

Abrir um link de contrato de teste e confirmar: o aviso aparece acima da caixa de aceite, legível, e o botão de envio continua desabilitado até marcar a caixa.

- [ ] **Step 5: Commit**

```bash
git add js/tenant-v2.js css/
git commit -m "feat(lgpd): avisa o inquilino do que e coletado antes do envio

IP, coordenada e navegador eram capturados no clique de 'Salvar e
Enviar', sem etapa propria de aviso. A coordenada fica com precisao
maxima (~11 cm) por decisao do usuario, pelo valor probatorio — e nesse
nivel o dado revela endereco e rotina do titular. A LGPD tolera a coleta
declarada, nao a silenciosa: o aviso nomeia o que e coletado, para que, e
aparece antes da caixa de aceite."
```

---

### Task 8: Limites de autenticação e versão dos assets

**Files:**
- Modify: `app.html` (18 ocorrências de `?v=1.25.0`)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Configurar os limites no painel do Supabase**

Recurso nativo, sem código, cobre o vetor mais comum contra contas de clientes: força bruta de senha. Em **Authentication → Rate Limits**, confirmar/ajustar:

| Limite | Valor sugerido | Protege de |
|---|---|---|
| Sign in / Sign up | 30 por hora por IP | força bruta de senha |
| Password recovery | 10 por hora por IP | enxurrada de e-mail de reset |
| Token refresh | deixar o padrão | — |

Em **Authentication → Providers → Email**, confirmar que **"Confirm email"** está ligado — sem isso qualquer um cria conta com e-mail alheio.

- [ ] **Step 2: Subir a versão dos assets**

Sem isso o navegador dos clientes serve o JavaScript antigo e as correções das Tasks 1, 2, 5 e 7 não chegam a ninguém.

Run:
```bash
sed -i 's/?v=1\.25\.0/?v=1.26.0/g' app.html
grep -c '?v=1.26.0' app.html
```
Expected: `18`

- [ ] **Step 3: Confirmar que não sobrou versão antiga**

Run: `grep -n '1\.25\.0' app.html`
Expected: nenhum resultado.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "chore: assets para 1.26.0 apos as correcoes de seguranca

Sem o bump, o navegador dos clientes continua servindo o JavaScript
antigo e as correcoes nao chegam a ninguem."
```

---

### Task 9: Teste de ponta a ponta e publicação

**Files:** nenhum (validação).

- [ ] **Step 1: Fluxo completo com contrato descartável**

Confirma que a cerca não quebrou o uso real. Com dados fictícios, do começo ao fim:

1. Logado, criar um contrato de teste e gerar o link do inquilino → **deve funcionar** (a Task 3 exige sessão, e há sessão).
2. Abrir o link em **janela anônima** → o contrato carrega.
3. Preencher nome e CPF, assinar no pad, tirar/enviar selfie → o aviso de coleta aparece acima da caixa de aceite.
4. Marcar o aceite e enviar → sucesso.
5. Reabrir o mesmo link → deve aparecer a tela de "já enviado" (somente leitura).
6. Tentar enviar de novo pelo mesmo link → deve falhar com "Este link expirou ou já foi enviado".
7. Logado, importar pelo link `#import` → o contrato chega com assinatura e selfie visíveis.
8. Gerar o PDF → certificado com IP, GPS, hash e as imagens.

- [ ] **Step 2: Confirmar que o furo continua fechado**

Repetir o teste negativo da Task 4, Step 3 (fetch com a chave pública, deslogado).
Expected: 401/403.

- [ ] **Step 3: Publicar**

```bash
git push origin main
```

A Vercel publica sozinha a partir do `main`. Conferir o site em produção depois do deploy: abrir o app, confirmar que carrega, e repetir o passo 2 contra produção.

- [ ] **Step 4: Atualizar o changelog na memória**

Regra permanente do usuário: toda sessão que altera o sistema atualiza `changelog-diario.md` em
`C:\Users\assis\.claude\projects\c--Users-assis-Desktop-Area-51-JVO-TECH\memory\`.

Acrescentar entrada em **2026-07-30** com: fechamento do acesso anônimo direto a `tenant_links` (enumeração e escrita sem chave), sanitização de fronteira contra XSS armazenado do inquilino para a sessão do locador, retenção 90 → 30 dias com expurgo, aviso de coleta de IP/GPS, e os hashes dos commits. Uma a duas linhas por item, com o porquê.

---

## Ordem e dependências

```
Task 1 (XSS fronteira) ──┐
Task 2 (escape textos) ──┤
Task 7 (aviso LGPD) ─────┼──→ Task 8 (versão) ──→ Task 9 (E2E + push)
                         │
Fase 0 (diagnóstico) ──→ Task 3 (cerca) ──→ Task 4 (verificação) ──┤
                              │                                     │
                              ├──→ Task 5 (fim do silêncio) ────────┤
                              └──→ Task 6 (expurgo) ────────────────┘
```

Tasks 1, 2 e 7 podem começar já. Tasks 3, 4, 5 e 6 esperam o diagnóstico. Task 8 exige que todo JavaScript esteja pronto. Task 9 é a última.

## Fora de escopo (registrado, não esquecido)

- **Remoção de `script-src 'unsafe-inline'`** — depende de migrar ~85 handlers inline para delegação de eventos. Enquanto não for feito, as Tasks 1 e 2 são a única barreira contra XSS.
- **`contracts.cloud_key` em claro** — a regra de leitura do admin concede a coluna, o que permitiria decifrar qualquer link. Como o admin é o próprio usuário, o risco é interno. Corrigir exige repensar onde a chave vive.
- **Dados do locador no payload** — CPF, RG e conta bancária vão no conteúdo enviado ao inquilino. Parte é legítima (o contrato os nomeia); minimizar exigiria separar o que vai no link do que fica no contrato.
- **Identificadores previsíveis** nas tabelas do ERP (`Date.now()` + 4 caracteres) — hoje mitigado pela RLS por dono; vira problema se a RLS falhar.
- **Limite por IP na atualização do link** — decidido no spec (§8.3) como **não implementar por padrão**. Com a Task 3 aplicada, a enumeração de identificadores desaparece e a superfície anônima encolhe para "atualizar um link cujo UUID já se conhece"; um contador por IP custaria uma tabela e uma escrita por requisição para cobrir um vetor que deixou de ser barato. Reconsiderar só se o volume observado no diagnóstico indicar abuso real.
- **Reescrita do modelo do link** (token curto assinado no servidor, imagens no Storage, chave fora da URL) — é onde isso deveria chegar; semanas de trabalho.
