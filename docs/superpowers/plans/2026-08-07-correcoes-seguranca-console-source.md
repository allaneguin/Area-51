# Correções de Segurança — Console e Source — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as brechas que a revisão de 07/08 encontrou no que um atacante alcança pelo **console do navegador** e pelo **source publicado** — com prioridade absoluta para a que permite ao inquilino reescrever a conta bancária de recebimento do locador.

**Architecture:** Duas correções estruturais, uma em cada ponta. **No cliente**, a regra "o inquilino só escreve a seção Locatário" — que hoje existe apenas como filtro de renderização — passa a valer também na **ingestão**, numa função única por onde os dois caminhos de entrada (sincronização do editor e importação por link) obrigatoriamente passam. **No banco**, a evidência do aceite deixa de ser autodeclarada dentro do blob cifrado e passa a ser carimbada pelo servidor, fora do alcance de quem assina.

**Tech Stack:** JavaScript vanilla (sem build, objetos globais em `window`), PostgreSQL/Supabase (RLS + funções plpgsql), testes em Node com `assert` e o padrão `new Function()` já usado no repositório.

**Origem:** revisão de segurança de 2026-08-07 (três frentes: fronteira RLS/RPC, superfície de console, sinks de XSS e segredos). Achados confirmados por leitura direta do código antes de entrarem aqui.

## O que NÃO está quebrado (não mexer)

Registrado para a próxima revisão não gastar tempo e para ninguém "consertar" o que está certo:

- **RLS das 5 tabelas está correta.** Política por operação amarrada em `auth.uid()`, com `WITH CHECK` no INSERT e no UPDATE. Não há `USING (true)`. Não dá para inserir linha no nome de outro nem alterar linha alheia.
- **O painel de superadmin é cosmético e isso é suficiente.** Forjar `App.user.app_metadata.role = 'admin'` no console abre a *tela*, e o servidor devolve lista vazia — `app_metadata` só é gravável por service role, e o SDK do cliente só escreve `user_metadata`, que nenhuma política consulta. Não transformar em problema.
- **O vetor de XSS que importa (inquilino → sessão do locador) está fechado.** `Utils.esc` e `Utils.imgSeguro` estão aplicados de forma consistente em todos os sinks que recebem dado do inquilino. A Task 3 trata as 6 exceções, que são de outro perfil de risco (só o próprio locador escreve).
- **A chave publishable em `js/supabase-config.js` é pública por design.** Não é vazamento. Nenhuma `service_role` key foi encontrada no repositório.

## Global Constraints

- **Sem framework, sem build, sem dependência nova** (R1). O projeto é servido como arquivos estáticos.
- **Toda mudança de banco é migration nova e idempotente** em `supabase/migrations/` (R4.2). Os `supabase_*.sql` da raiz estão congelados e não voltam a rodar.
- **`tenant_links` continua com zero políticas** e teto de 512 KB (R5.2). Nada aqui afrouxa isso.
- **Autorização só por `app_metadata`** (R5.3). Nenhuma tarefa daqui introduz autorização por `user_metadata` ou `profile_data`.
- **CSP não regride** (R5.5) — a Task 4 aperta, nunca afrouxa.
- **Comentários e mensagens de erro em português**, seguindo o código existente. Sem emoji (convenção de 07/08).
- **Compatibilidade com links já emitidos.** Existem links vivos com até 30 dias. Toda mudança de RPC precisa manter o link antigo funcionando até expirar — o padrão é `coluna is null or coluna = <novo check>`.
- **Ao final, bumpar o track de assets do `app.html`** de `?v=1.28.2` para `?v=1.29.0` (R7) e registrar no CHANGELOG (R9).

---

## Fase 0 — Pré-requisito bloqueante: o estado real do banco

Nada da Fase 2 pode ser escrito antes disto. A revisão leu os `.sql` do repositório, **não o servidor** — e o repositório não prova o que está aplicado em produção.

- [x] **Step 0.1: Descobrir se a migration 002 está aplicada**

No SQL Editor do Supabase:

```sql
select policyname from pg_policies where schemaname = 'public' and tablename = 'contracts';
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('admin_list_contracts','admin_list_users');
```

Se `contracts_select_admin` **aparecer**, a 002 não foi aplicada: o admin ainda lê `contracts` inteira, incluindo `cloud_key` — e `cloud_key` + `cloud_id` decifram qualquer link **sem sessão nenhuma**, porque `get_tenant_link` é executável por `anon`. Nesse caso, **aplicar a 002 antes de qualquer outra coisa deste plano**; ela vira a tarefa de maior prioridade, acima até da Task 1.

- [x] **Step 0.2: Coletar o que decide o desenho da Fase 2**

```sql
select extname from pg_extension where extname = 'pg_cron';               -- decide a Task 8
select has_schema_privilege('anon','public','create'),
       has_schema_privilege('authenticated','public','create');           -- endurecimento barato
select proname, pg_get_userbyid(proowner) from pg_proc
 where proname like '%tenant_link%' or proname like 'admin_%';            -- dono das SECURITY DEFINER
select count(*) filter (where key_proof is null) as links_legado from public.tenant_links;
```

> A última consulta só funciona depois da Task 7; antes dela, use `select count(*) from public.tenant_links where expires_at > now();` para dimensionar quantos links vivos precisarão do caminho de compatibilidade.

---

## File Structure

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `js/utils.js` | Ganha `mesclarCamposDoInquilino` (lista branca de ingestão) e passa a ler a evidência do servidor no certificado. | 1, 9 |
| `js/editor.js` | Sincronização em segundo plano passa pela lista branca; recuperação de link ilegível. | 1, 6 |
| `js/app.js` | Importação por `#import` passa pela lista branca. | 1 |
| `js/admin.js` | `Utils.esc` nos 6 inputs; exclusão de conta exige senha. | 3, 5 |
| `js/tenant-v2.js` | Link de importação sai da query do `wa.me`. | 2 |
| `js/ingestao.test.js` | **Novo.** Prova que campo do locador não é sobrescrito pelo inquilino. | 1 |
| `js/seguranca.test.js` | Ganha o check de escape nos inputs do admin. | 3 |
| `.vercelignore` | **Novo.** Tira `.sql`, `docs/` e testes do deploy. | 4 |
| `app.html` | CSP sem curinga; versão dos assets. | 5, 10 |
| `supabase/migrations/003_aceite_servidor.sql` | **Novo.** Carimbo de aceite no servidor + prova de posse da chave. | 7, 8 |
| `supabase/verificacao.sql` | Ganha os checks 13–16 (inclui a lacuna que deixava a 002 passar despercebida). | 8 |
| `CHANGELOG.md`, `docs/ARQUITETURA.md` | Registro da rodada e das dívidas que sobram. | 10 |

**Ordem recomendada:** Fase 1 (Tasks 1–6) é toda cliente/config, sem tocar no banco — pode ir para produção sozinha e já mata o achado mais grave. Fase 2 (Tasks 7–9) depende da Fase 0 e envolve migration.

---

# Fase 1 — Cliente e configuração (sem tocar no banco)

### Task 1: Lista branca de campos na ingestão

**Por que primeiro:** é o achado mais grave e não depende de nada. Hoje quem tem um link altera `conta_banco`, `banco`, `valor_aluguel`, `data_termino` e os flags `exigir_selfie`/`exigir_assinatura` pelo console, e o valor entra no registro do locador **sem um clique dele** — a sincronização é automática ao abrir o contrato. A conta bancária do atacante sai no PDF, na cláusula "de titularidade do LOCADOR".

**A causa:** a regra "o inquilino só preenche a seção Locatário" existe **só como filtro de renderização** em `js/tenant-v2.js:444`. Na volta, `js/editor.js:126` faz `this.contract.fields = cloudPayload.f` — troca o objeto inteiro — e `js/app.js:156` faz o mesmo na importação.

**Files:**
- Modify: `js/utils.js` (novo método no objeto `Utils`)
- Modify: `js/editor.js` (linhas 121–139), `js/app.js` (linhas 153–171)
- Create: `js/ingestao.test.js`
- Modify: `package.json` (acrescentar o teste novo ao script `test`)

- [x] **Step 1.1: Escrever o teste que falha**

Criar `js/ingestao.test.js`, no padrão dos outros (Node puro, lê o fonte e avalia com `new Function`):

```js
// Check da lista branca de ingestao: o payload do link e montado por quem tem a
// chave (inclusive o inquilino) e volta para dentro do contrato do locador.
// So a secao Locatario, mais a trilha de aceite, podem entrar.
// Rodar: node js/ingestao.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'utils.js'), 'utf8');
const Utils = new Function(`${src}; return Utils;`)();

// Modelo minimo no formato de data/contracts.js
global.Contracts = {
  residencial: {
    fields: [
      { section: 'Locador', name: 'nome_locador', label: 'Nome', type: 'text' },
      { section: 'Locador', name: 'conta_banco', label: 'Conta', type: 'text' },
      { section: 'Imóvel', name: 'valor_aluguel', label: 'Aluguel', type: 'text' },
      { section: 'Locatário', name: 'nome_locatario', label: 'Nome', type: 'text' }
    ]
  }
};

const doLocador = {
  nome_locador: 'Allan', conta_banco: '12345-6', valor_aluguel: 'R$ 2.450,00',
  assinatura_locador: 'data:image/png;base64,AAAA'
};

const doInquilino = {
  nome_locatario: 'Theo',                      // legitimo: secao Locatario
  assinatura_locatario: 'data:image/png;base64,BBBB',  // legitimo: trilha
  aceite_ts: '2026-08-07T12:00:00.000Z',       // legitimo: trilha
  conta_banco: '99999-9',                      // ATAQUE: campo do locador
  valor_aluguel: 'R$ 1,00',                    // ATAQUE: campo do imovel
  assinatura_locador: 'data:image/png;base64,XXXX'     // ATAQUE: assinatura alheia
};

const r = Utils.mesclarCamposDoInquilino(doLocador, doInquilino, 'residencial');

assert.strictEqual(r.conta_banco, '12345-6', 'conta do locador NAO pode ser sobrescrita');
assert.strictEqual(r.valor_aluguel, 'R$ 2.450,00', 'valor do aluguel NAO pode ser sobrescrito');
assert.strictEqual(r.assinatura_locador, 'data:image/png;base64,AAAA', 'assinatura do locador e dele');
assert.strictEqual(r.nome_locatario, 'Theo', 'campo da secao Locatario deve entrar');
assert.strictEqual(r.assinatura_locatario, 'data:image/png;base64,BBBB', 'assinatura do inquilino deve entrar');
assert.strictEqual(r.aceite_ts, '2026-08-07T12:00:00.000Z', 'trilha de aceite deve entrar');

// Campo desconhecido nao entra (o inquilino nao inventa chave nova no objeto).
const r2 = Utils.mesclarCamposDoInquilino({}, { campo_inventado: 'x' }, 'residencial');
assert.strictEqual(r2.campo_inventado, undefined, 'campo fora do modelo nao entra');

// Modelo inexistente: nao explode e nao deixa passar campo do locador.
const r3 = Utils.mesclarCamposDoInquilino(doLocador, doInquilino, 'nao_existe');
assert.strictEqual(r3.conta_banco, '12345-6', 'modelo desconhecido: nada do locador muda');
assert.strictEqual(r3.aceite_ts, '2026-08-07T12:00:00.000Z', 'trilha entra mesmo sem modelo');

console.log('ok — ingestao: lista branca barra campo do locador vindo do inquilino');
```

Rodar `node js/ingestao.test.js` — deve falhar com `mesclarCamposDoInquilino is not a function`.

- [x] **Step 1.2: Implementar a lista branca em `js/utils.js`**

Acrescentar ao objeto `Utils`, perto de `esc`/`imgSeguro` (a vizinhança das defesas):

```js
  // Campos que o inquilino escreve legitimamente mas que NAO estao declarados
  // como secao 'Locatário' no modelo: assinatura, selfie e a trilha do aceite.
  // assinatura_locador ficou de fora de proposito — e do outro lado.
  CAMPOS_EXTRA_DO_INQUILINO: [
    'assinatura_locatario', 'selfie_locatario',
    'aceite_ts', 'aceite_hash', 'ip_acesso',
    'geo_lat', 'geo_lng', 'geo_acc', 'user_agent'
  ],

  // O payload do link e montado no navegador do inquilino: e dado hostil (R5.4).
  // A regra "so a secao Locatário" existia so no filtro de renderizacao da tela
  // dele — quem abrisse o console reescrevia conta bancaria, valor e prazo do
  // locador. Aqui ela vale na INGESTAO, que e onde decide.
  mesclarCamposDoInquilino(locais, doInquilino, templateId) {
    const tpl = (typeof Contracts !== 'undefined' && Contracts[templateId]) || null;
    const permitidos = new Set([
      ...(tpl ? tpl.fields
        .filter(f => (f.section || '').toLowerCase() === 'locatário')
        .map(f => f.name) : []),
      ...Utils.CAMPOS_EXTRA_DO_INQUILINO
    ]);

    const saida = Object.assign({}, locais || {});
    Object.keys(doInquilino || {}).forEach(k => {
      if (permitidos.has(k)) saida[k] = doInquilino[k];
    });
    return saida;
  },
```

- [x] **Step 1.3: Aplicar na sincronização do editor (`js/editor.js:121-139`)**

**Atenção — armadilha real:** a comparação tem de ser contra o **resultado do merge**, não contra `cloudPayload.f`. Comparar com o payload cru faz `mudou` ser sempre verdadeiro (o payload traz campos que o merge descarta), `render()` reentra e vira laço infinito de requisições.

```js
      CloudDB.loadContract(this.contract.cloudId, this.contract.cloudKey).then(cloudPayload => {
        const mesclado = Utils.mesclarCamposDoInquilino(
          this.contract.fields, cloudPayload.f, this.contract.templateId);
        const mudou = JSON.stringify(mesclado) !== JSON.stringify(this.contract.fields);

        if (mudou || cloudPayload.isFinalized) {
          this.contract.fields = mesclado;
          if (cloudPayload.isFinalized) {
            this.contract.isFinalized = true;
          }

          Storage.update(this.contract.id, {
            fields: this.contract.fields,
            isFinalized: this.contract.isFinalized
          });

          this.render(container, param);
        }
      }).catch(err => console.warn("Erro ao sincronizar com a nuvem no background:", err));
```

- [x] **Step 1.4: Aplicar na importação (`js/app.js:153-171`)**

```js
          if (existing) {
            const updated = Storage.update(existing.id, {
              fields: Utils.mesclarCamposDoInquilino(existing.fields, payload.f, existing.templateId),
              isFinalized: true
            });
            localId = updated.id;
          } else {
            // Sem contrato local nao ha base do locador para preservar: entram so
            // os campos do inquilino, e os do locador ficam VAZIOS (visivelmente)
            // em vez de virem preenchidos por quem mandou o link.
            const newContract = Storage.create({
              name: 'Contrato Importado - ' + (payload.f.nome_locatario || 'Inquilino'),
              templateId: payload.t,
              fields: Utils.mesclarCamposDoInquilino({}, payload.f, payload.t),
              cloudId: serverId,
              cloudKey: key,
              isFinalized: true
            });
            localId = newContract.id;
          }
```

- [x] **Step 1.5: Registrar o teste no `package.json`**

Acrescentar `node js/ingestao.test.js` ao script `test`, mantendo o encadeamento por `&&`.

**Verificação:** `npm test` passa com o arquivo novo. Depois, teste de ponta a ponta: gere um link de um contrato com `conta_banco` preenchida; na aba do inquilino, `Tenant.contract.fields.conta_banco = '99999-9'` e envie; abra o contrato no painel — `Storage.getById(id).fields.conta_banco` tem de manter o valor original e `nome_locatario` tem de ter chegado. Confirme na aba Network que abrir o editor faz **uma** chamada a `get_tenant_link`, não um laço.

---

### Task 2: O link do inquilino sai da query string do `wa.me`

**Por quê:** `js/tenant-v2.js:647-649` monta `#import?id=…&key=…` e passa por `encodeURIComponent` para dentro de `https://wa.me/?text=`. O `#` vira `%23` e o **fragmento vira query string** — ou seja, o par id+chave, que é bearer token puro e resgatável anonimamente por `get_tenant_link`, viaja num GET para servidor da Meta e fica no histórico. É o único ponto do sistema que quebra a disciplina de manter a chave fora de requisição.

**Files:** Modify `js/tenant-v2.js`

- [x] **Step 2.1: Usar o modal de compartilhamento que já existe**

`Utils.showShareModal` (`js/utils.js:328`) já faz campo de cópia + `navigator.share`. Reaproveitar em vez de escrever tela nova:

```js
      }).then(() => {
        this.clearDraft();
        const importUrl = Utils.shareBaseUrl() + '#import?id=' + this.contract.cloudId + '&key=' + this.contract.cloudKey;
        // O link NAO entra na query do wa.me: ali ele viraria um GET para servidor
        // de terceiro carregando a chave de decifragem. Vai por area de
        // transferencia / navigator.share, que ficam no dispositivo.
        const waUrl = "https://wa.me/?text=" + encodeURIComponent(
          "Olá! Preenchi os meus dados no contrato. Vou colar o link de importação na próxima mensagem.");

        saveFinishedUI(waUrl);
        Utils.showShareModal(importUrl);
      }).catch(err => {
```

**Verificação:** conclua um envio e inspecione o `href` do botão verde — `decodeURIComponent(href)` não pode conter `#import` nem `key=`. Na aba Network, nenhuma requisição para `wa.me` carregando a chave.

---

### Task 3: `Utils.esc` nos 6 inputs do perfil

**Por quê:** `js/admin.js` linhas **30, 53, 57, 66, 70, 74** interpolam o perfil dentro de `value="${…}"` sem escape. São as **únicas** interpolações de dado de usuário em atributo sem escape no projeto inteiro. Severidade baixa — só o próprio locador escreve nesses campos, então é self-XSS ou engenharia social, não um caminho de terceiro. Entra porque o custo é uma linha cada e porque a exceção convida a próxima.

**Files:** Modify `js/admin.js`, `js/seguranca.test.js`

- [x] **Step 3.1: Aplicar o escape**

Nos seis inputs (`admin_nome_locador`, `admin_rg_locador`, `admin_doc_locador`, `admin_banco`, `admin_agencia`, `admin_conta_banco`):

```js
value="${Utils.esc(profile.nome_locador)}"
```

O `|| ''` sai: `Utils.esc(null)` já devolve `''` (`js/utils.js:212`).

- [x] **Step 3.2: Acrescentar o check de regressão a `js/seguranca.test.js`**

Um assert que renderize o HTML do admin com `nome_locador = 'a" onfocus="alert(1)'` e verifique que a string `" onfocus=` não aparece na saída.

**Verificação:** salve `a" onfocus="alert(1)` no nome, recarregue `#admin`, inspecione o input — o valor tem de aparecer escapado (`value="a&quot; onfocus=..."`) e nada dispara.

---

### Task 4: Tirar `.sql`, `docs/` e testes do deploy

**Por quê:** o deploy da Vercel publica o repositório inteiro. Hoje `/supabase_admin.sql`, `/supabase/migrations/001_baseline.sql` e `/docs/ARQUITETURA.md` respondem 200 para qualquer um — entregando esquema, políticas, corpo das funções `SECURITY DEFINER`, o e-mail do superadmin (`adm@gmail.com`) e um documento interno que lista as fraquezas ainda aceitas, com probe pronto contra o projeto de produção. Nenhum desses arquivos é lido em runtime: `app.html` carrega só `css/`, `js/`, `data/` e `fonts/`.

**Files:** Create `.vercelignore`

- [x] **Step 4.1: Criar `.vercelignore` na raiz**

```
supabase/
supabase_*.sql
docs/
*.test.js
.github/
CHANGELOG.md
README.md
```

- [x] **Step 4.2: Trocar o e-mail do admin por marcador**

`supabase_admin.sql:25` traz `adm@gmail.com` fixo. O arquivo está congelado (R4.1) e **não volta a rodar**, então trocar o e-mail por `ENDERECO@EXEMPLO.COM` não altera comportamento nenhum — é higiene de segredo, no mesmo espírito do que `001_baseline.sql:22` já decidiu ("conceder papel é dado, não estrutura"). Reescrever histórico do git por um e-mail não compensa; o que importa é sair do HEAD e do deploy.

**Verificação:** depois do deploy, `curl -o /dev/null -w "%{http_code}\n" https://<deploy>/supabase_admin.sql https://<deploy>/docs/ARQUITETURA.md` — nenhum pode devolver 200. E `curl -o /dev/null -w "%{http_code}\n" https://<deploy>/js/utils.js` **tem** de continuar 200, senão o ignore foi longe demais e o app quebrou.

---

### Task 5: CSP sem curinga e exclusão de conta com senha

**Por quê:** duas coisas que só importam depois de um XSS, mas que transformam "um XSS" em "tomada de conta permanente + destruição irreversível".

1. `connect-src https://*.supabase.co` aceita **qualquer** projeto Supabase como destino — inclusive um projeto gratuito do atacante. O curinga anula o propósito declarado da CSP ("backstop contra exfiltração").
2. `supabaseClient.rpc('delete_own_account')` apaga contratos, perfil e usuário, irreversivelmente, em uma linha de console. O `prompt('digite EXCLUIR')` de `js/admin.js:149` é UI, não controle.

**Files:** Modify `app.html`, `js/admin.js`

- [x] **Step 5.1: Fixar o domínio real do projeto na CSP**

Trocar `https://*.supabase.co` e `wss://*.supabase.co` pelo host exato do projeto. Mesma coisa em `https://*.ipify.org`, que é redundante com `https://api.ipify.org`. Registrar em `docs/ARQUITETURA.md` (R5.5 exige o porquê de cada domínio).

- [x] **Step 5.2: Exigir a senha para excluir a conta**

`js/admin.js:147-155` passa a revalidar com `signInWithPassword` antes de chamar a RPC, e só chama se a senha conferir.

**Verificação:** `fetch('https://outro-projeto.supabase.co/x')` no console tem de morrer com erro de CSP, e o app tem de continuar funcionando normalmente (login, carga de dados, realtime). `Admin.deleteAccount()` com senha errada não pode chamar a RPC — confira na aba Network.

---

### Task 6: Link ilegível não pode travar o contrato

**Por quê:** é o lado cliente do problema que a Task 7 fecha no banco, e sozinho já evita o pior sintoma. Quando o payload do link é ilegível, `CloudDB.loadContract` rejeita com **"Chave do link incorreta ou link incompleto."** — mensagem que **não casa** com o regex de recuperação em `js/editor.js:554` (`/expir|não existe|inexistente/i`). O caminho "descarta a referência e gera outro" nunca roda, `cloudId`/`cloudKey` ficam apontando para um link morto, e todo clique em "Gerar Link p/ Inquilino" cai em toast de erro. O locador só sai disso apagando e refazendo o contrato.

**Files:** Modify `js/editor.js`

- [x] **Step 6.1: Tratar qualquer falha de leitura como "gerar outro"**

Trocar o `catch` seletivo por incondicional: expirado, removido ou adulterado — em todos os casos o certo é descartar a referência e gerar um link novo, nunca travar o contrato.

**Verificação:** com um link válido, corrompa o payload (Task 7 dá o caminho pelo console, ou edite a linha pelo SQL Editor); clique em "Gerar Link p/ Inquilino" — tem de sair um link novo funcionando, não um toast de erro.

---

# Fase 2 — Banco (depende da Fase 0)

### Task 7: Migration 003 — prova de posse da chave em `set_tenant_link`

**Por quê:** hoje o `WHERE` de `set_tenant_link` é `id = p_id and expires_at > now() and not finalized`. **A chave AES não participa da autorização.** Quem tiver só o `id` — link encaminhado em grupo, print cortado, histórico do navegador — sobrescreve o payload e marca `finalized = true` de uma aba anônima, sem sessão. A partir daí nenhuma função des-finaliza e a tabela não tem política de UPDATE, então **nem o locador dono conserta**. Se o inquilino já tinha enviado, a selfie, o IP e as coordenadas do aceite somem do servidor.

**Desenho:** o cliente envia `SHA-256(chave)`; o servidor guarda `SHA-256(SHA-256(chave))`. O servidor nunca aprende a chave (mantém a propriedade de que a tabela sozinha não decifra nada), e quem não a tem não escreve. `sha256()` é built-in do Postgres 11+ — sem `pgcrypto`, sem dependência nova.

**Files:** Create `supabase/migrations/003_aceite_servidor.sql`; Modify `js/database.js`

- [x] **Step 7.1: Coluna + `create_tenant_link` recebendo a prova**

`alter table ... add column if not exists key_proof text;` e a função passando a gravar `encode(sha256(convert_to(p_key_proof,'UTF8')),'hex')`, validando o formato (`^[0-9a-f]{64}$`).

- [x] **Step 7.2: `set_tenant_link` exigindo a prova, com compatibilidade**

```sql
     and (key_proof is null            -- link legado: comportamento antigo ate expirar
          or key_proof = encode(sha256(convert_to(coalesce(p_key_proof,''),'UTF8')),'hex'))
```

- [x] **Step 7.3: `CloudDB` derivando e enviando a prova**

`crypto.subtle.digest('SHA-256', …)` sobre a chave, hex, enviado em `saveContract` e `updateContract`.

**Verificação:** crie um link pelo app; de uma aba anônima, chame `set_tenant_link` com o `id` correto e `p_key_proof` ausente ou errado — deve devolver `false` e a linha não pode mudar. Com o proof correto, `true`. Um link criado **antes** da migration tem de continuar funcionando.

---

### Task 8: Carimbo de aceite no servidor + expurgo fora da leitura

**Por quê:** `aceite_ts`, `ip_acesso`, `geo_lat/lng` e `aceite_hash` são gravados no navegador de quem assina e viajam **dentro** do blob cifrado; o servidor recebe payload opaco e não olha nada. Pelo console, o signatário escolhe a data, o IP e as coordenadas que vão sair no certificado — justamente a prova que deveria valer contra ele. O certificado cita MP 2.200-2/2001 e Lei 14.063/2020, então isso é o núcleo do valor do produto.

**No mesmo arquivo, dois ajustes menores:** `get_tenant_link` hoje executa um `DELETE` a cada chamada (transação de escrita numa função aberta a `anon`, sem contenção) — o expurgo migra para o caminho autenticado; e o teto de `create_tenant_link` passa a ser por **bytes**, porque 100 links/dia × 512 KB × 30 dias de retenção dá ~1,5 GB por usuário, o triplo da cota do plano que o controle deveria proteger.

> Se a Fase 0 mostrar que `pg_cron` **não** está instalado, manter um expurgo oportunista em `create_tenant_link` (caminho autenticado e já limitado), nunca de volta em `get_tenant_link`.

**Files:** Modify `supabase/migrations/003_aceite_servidor.sql`, `supabase/verificacao.sql`

- [x] **Step 8.1: Colunas `finalized_at` / `finalized_ip` carimbadas pelo servidor**
- [x] **Step 8.2: `get_tenant_link` devolvendo a evidência do servidor junto do payload**
- [x] **Step 8.3: Tirar o `DELETE` de `get_tenant_link`; cota por bytes em `create_tenant_link`**
- [x] **Step 8.4: Fechar a lacuna do `verificacao.sql`**

O arquivo hoje imprime "OK — as 12 garantias conferidas" **mesmo com a migration 002 ausente**: nenhum dos 12 testes olha para `contracts_select_admin` ou `admin_list_contracts`. Foi exatamente esse ponto cego que tornou a Fase 0 necessária. Acrescentar:

- **13:** `contracts_select_admin` não existe mais (prova que a 002 foi aplicada)
- **14:** `admin_list_contracts` existe e não devolve `cloud_key`/`cloud_id`
- **15:** `get_tenant_link` e `set_tenant_link` continuam executáveis por `anon` (uma regressão aqui quebraria o envio do inquilino em silêncio, e os 12 testes atuais continuariam passando)
- **16:** `key_proof` existe e `set_tenant_link` a exige

Atualizar "12 checagens" em `supabase/README.md:21` e `docs/ARQUITETURA.md:119`.

**Verificação:** forje `aceite_ts`/`ip_acesso` pelo console e envie; `select finalized_at, finalized_ip from tenant_links where id = '…'` tem de mostrar o horário real do banco e o IP visto pelo PostgREST. Rode `verificacao.sql`: tem de passar inteiro — e, se você derrubar a 002 num projeto de teste, tem de **falhar** no check 13.

---

### Task 9: O certificado imprime a evidência do servidor

**Por quê:** sem isto a Task 8 não muda nada visível — o PDF continuaria imprimindo o valor autodeclarado.

**Files:** Modify `js/utils.js` (`renderCertificadoHTML`), `js/database.js`

- [x] **Step 9.1: `CloudDB.loadContract` expõe `aceite_ts_servidor` / `ip_servidor`** a partir das colunas novas — nomes que **nunca** vêm do payload (a lista branca da Task 1 não os inclui, então o inquilino não consegue forjá-los).
- [x] **Step 9.2: `renderCertificadoHTML` lê esses dois campos**, com rótulo honesto quando ausentes (links antigos): `'Não registrado pelo servidor'`.
- [x] **Step 9.3:** aproveitar e envolver `${dataAceite}` (`js/utils.js:815`) em `Utils.esc` — hoje não é injetável porque passa por `toLocaleString`, mas é o único sink do certificado sem escape.

**Verificação:** gere um contrato assinado depois da migration e confira que o certificado traz o horário do banco. Um contrato assinado **antes** tem de continuar renderizando, com o aviso de não registrado.

---

# Fase 3 — Release

### Task 10: Versão, CHANGELOG e dívidas

- [x] **Step 10.1:** bumpar os 27 `?v=1.28.2` do `app.html` para `?v=1.29.0` (R7.1). A landing não é afetada por nenhuma tarefa deste plano — o track `2.0.4` fica.
- [x] **Step 10.2:** `npm test` verde e CI passando.
- [x] **Step 10.3:** seção nova no `CHANGELOG.md` citando a versão e os hashes (R9).
- [x] **Step 10.4:** atualizar `docs/ARQUITETURA.md` — domínios da CSP (R5.5), estado das migrations, e a seção de dívidas com o que fica de fora (abaixo).

---

## O que este plano NÃO resolve (dívida consciente)

Registrar é parte do trabalho — estas são limitações da arquitetura, não esquecimentos:

1. **`contracts.cloud_key` continua em claro no banco.** É risco já aceito (`docs/ARQUITETURA.md` §7), mas é o que dá gravidade ao Fase 0: quem lê `contracts` decifra todos os links. Enquanto for assim, **qualquer** política que exponha `contracts` é crítica, não incômoda.
2. **O locador ainda manda CPF/RG/banco dele dentro do link.** `js/editor.js:28-33` copia o perfil inteiro para `fields`. A Task 1 impede que o inquilino **escreva** nesses campos, mas ele continua **lendo** — decisão registrada na spec de 30/07. Resolver exige separar o payload em duas partes, o que é redesenho.
3. **Não existe revogação de link.** `tenant_links` não tem função de DELETE para o dono; um link vazado só morre por expiração. Relevante para LGPD.
4. **Continua não havendo revalidação de sessão para ações destrutivas além da exclusão de conta** (Task 5 cobre só ela).
5. **Configuração de Auth do Supabase não é versionada** — rate limit de login e de reset, política de senha, confirmação de e-mail, rotação de refresh token. Só existe no painel. Nenhum arquivo deste repositório prova nada sobre isso.
6. **Zero cobertura de teste em editor, tenant e auth** (~2.100 linhas). Este plano acrescenta 1 arquivo de teste; não muda o quadro.
