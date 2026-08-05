# Meus Imóveis 🏠🔒

Aplicação web para **geração e gestão de contratos de locação imobiliária**. O locador monta o contrato a partir de um modelo, envia um link seguro para o inquilino preencher os próprios dados, e recebe o contrato completo de volta pronto para impressão.

> [!IMPORTANT]
> **Projeto privado, em construção.** Veja [Propriedade intelectual](#-propriedade-intelectual) antes de qualquer uso.

---

## 🔄 Como funciona

```
Locador                          Inquilino
   │
   ├─ escolhe o modelo
   ├─ preenche imóvel e valores
   ├─ gera link seguro  ──────────►  abre no celular
   │                                 ├─ lê o contrato
   │                                 ├─ preenche seus dados
   │                                 └─ aceita e envia
   ◄────────────────────────────────  devolve link
   ├─ importa o contrato preenchido
   └─ imprime / salva em PDF
```

O link do inquilino carrega um **payload cifrado em AES-GCM** no próprio navegador, com chave de 16 caracteres gerada por CSPRNG e transportada na URL. O backend armazena apenas o texto cifrado — id e chave da URL funcionam como *bearer token*. Links expiram em 30 dias e são regenerados automaticamente quando vencidos.

---

## ✨ Funcionalidades

**Painel do locador**
- Cadastro e login com perfil **PF ou PJ**, com campos distintos para cada
- Recuperação e redefinição de senha por e-mail
- Dashboard: total de contratos, vencimentos nos próximos 30 dias, receita mensal somada
- Lista separada em abas Residenciais e Comerciais, com badges de status (Ativo, A Iniciar, Vencido, Pendente)
- Perfil do locador reaproveitado no preenchimento automático dos contratos

**Editor**
- Formulário gerado a partir do modelo, agrupado por seções, com **preview do documento ao vivo** ao lado
- Valor do aluguel e data de assinatura escritos por extenso automaticamente
- Data de término calculada a partir de início + prazo
- Máscaras de CPF/CNPJ e moeda

**Fluxo do inquilino**
- Tela dedicada a celular, sem necessidade de conta
- Leitura do contrato completo antes do aceite
- Validação de dígito verificador de CPF
- Checkbox de aceite obrigatório
- Devolução ao locador por deep-link de WhatsApp

**Outros**
- Exportação em PDF pela impressão nativa do navegador

---

## 🛠️ Stack

HTML, CSS e JavaScript puros — **sem framework, sem build step, sem `package.json`**.

- Scripts globais carregados com `<script defer>` em ordem fixa, com cache-busting manual por querystring
- Única dependência externa: `@supabase/supabase-js` via CDN
- Backend: **Supabase** (Auth + Postgres + RPCs) — não há servidor próprio
- Criptografia: WebCrypto (`crypto.subtle`) nativo do navegador
- CSP restritiva declarada em `<meta>` no `app.html`

---

## 🗄️ Modelo de dados

| Tabela | Conteúdo | Acesso |
|---|---|---|
| `contracts` | contratos do locador, campos em JSON | privado por `auth.uid()` |
| `profiles` | perfil do locador, dados em JSON | privado por `auth.uid()` |
| `tenant_links` | payload cifrado dos links públicos | apenas via RPC, enquanto não expirado |

`tenant_links` nunca é acessada diretamente — só pelas RPCs `create_tenant_link`, `set_tenant_link` e `get_tenant_link`.

> [!WARNING]
> A chave do Supabase em `js/supabase-config.js` é a *publishable/anon*, pública por natureza. **Toda a segurança dos dados depende das políticas de RLS estarem aplicadas.** Os `supabase_*.sql` da raiz estão **congelados como registro histórico — não os execute**: reexecutar `supabase_schema.sql`, `supabase_rls.sql` ou `supabase_finalize.sql` **reabre furos de segurança** corrigidos em 30/07. O que é executável vive em `supabase/` — para conferir que as políticas vigentes estão ativas, rode `supabase/verificacao.sql` (somente leitura). Ver `docs/ARQUITETURA.md`.

---

## 🔧 Rodando localmente

Não há instalação nem build. Mas **não abra por `file://`** — a CSP e o `crypto.subtle` exigem contexto seguro. Suba um servidor estático:

```bash
npx serve
# ou
python -m http.server
```

Depois acesse `index.html` (landing) ou `app.html` (aplicação).

O Supabase é obrigatório: se o SDK não carregar, o app mostra erro em vez de abrir o painel sem login (*fail-closed*). Para **provisionar um projeto novo**, rode `supabase/migrations/001_baseline.sql` no SQL Editor e depois `supabase/verificacao.sql` para conferir. Ajuste `supabaseUrl` e `supabaseKey` em `js/supabase-config.js`.

> Em produção o baseline **já está aplicado** — não precisa rodar nada. Toda mudança de banco daqui pra frente é uma migration nova em `supabase/migrations/`; ver `supabase/README.md`.

Testes:

```bash
node js/dashboard.test.js
```

---

## 📁 Estrutura

```
index.html              landing page
app.html                aplicação (SPA com router por hash)
termos.html             termos de uso e política de privacidade (LGPD)
fonts/                  fontes auto-hospedadas (woff2)
js/
  app.js                rotas e bootstrap
  auth.js               login, cadastro PF/PJ, recuperação de senha
  editor.js             formulário, preview e geração do link cifrado
  tenant-v2.js          fluxo do inquilino
  database.js           RPCs dos links
  storage.js            CRUD de contratos e perfil no Supabase
  dashboard.js          métricas
  contracts.js          lista de contratos
  templates.js          seleção de modelos
  utils.js              máscaras, validação, linha de contrato, PDF
  supabase-config.js    configuração e chave
data/contracts.js       modelos de contrato embutidos
css/                    um arquivo por área
supabase_rls.sql        políticas de RLS
```

---

## 🚧 Limitações conhecidas

- Apenas **2 modelos** de contrato, ambos residenciais — a aba Comercial fica sempre vazia. Não há UI para criar modelos próprios.
- **Não há assinatura eletrônica.** O fluxo termina em aceite por checkbox e PDF por impressão. A landing menciona "assine cada contrato" — o texto está à frente do que existe.
- Escritas no Supabase são *fire-and-forget*: o cache local já foi alterado e o erro só vai para o console. Divergência silenciosa é possível.
- Cobertura de testes mínima, só 2 funções do dashboard. Sem CI e sem linter.

---

## 🔒 Propriedade intelectual

⚠️ **AVISO LEGAL** ⚠️

O código-fonte, a arquitetura, o design de interface, as lógicas de negócio e toda a estrutura deste software são de propriedade intelectual exclusiva e protegida de seus criadores.

- **Acesso e contribuição restritos:** apenas desenvolvedores e colaboradores explicitamente convidados e autorizados pelos proprietários têm permissão para visualizar, realizar *commits* ou alterar o código deste repositório.
- **Nenhuma alteração autorizada por terceiros:** não é permitido fazer *fork*, copiar, modificar, distribuir, fazer engenharia reversa ou reutilizar qualquer parte deste código-fonte sem autorização prévia, expressa e documentada.
- **Proteção comercial:** é estritamente proibida a reprodução parcial ou total deste sistema para fins comerciais, acadêmicos ou pessoais por indivíduos não autorizados.

> Todo o conteúdo deste repositório está amparado pelas leis de proteção aos Direitos Autorais e de Propriedade Intelectual em vigor. Qualquer violação dos termos acima estará sujeita às sanções civis e penais cabíveis.

Termos completos em [LICENSE](LICENSE).

---

*Desenvolvido por Allan de Oliveira e Theo Carvalho.*
