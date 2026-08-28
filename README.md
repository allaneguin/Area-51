# Meus Imóveis

Aplicação web para **geração e gestão de contratos de locação imobiliária**. O locador monta o contrato a partir de um modelo, envia um link seguro para o inquilino preencher os próprios dados, e recebe o contrato completo de volta pronto para impressão.

> [!IMPORTANT]
> **Projeto privado, em construção.** Veja [Propriedade intelectual](#propriedade-intelectual) antes de qualquer uso.

---

## Como funciona

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

O link do inquilino carrega um **payload cifrado em AES-GCM** no próprio navegador, com chave de 16 caracteres gerada por CSPRNG e transportada no fragmento da URL (não vai em requisição nem em `Referer`). O id e a chave funcionam como *bearer token*: `tenant_links` guarda só o texto cifrado, e a chave também fica gravada no contrato do locador — é o que permite reabrir e regerar o link. Ou seja, a cifra protege contra a exposição isolada da tabela de links, **não** é ponta a ponta. Links expiram em 30 dias e são regenerados automaticamente quando vencidos.

---

## Funcionalidades

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

**Assinatura e trilha de auditoria**
- Assinatura manuscrita das duas partes, desenhada em canvas (locador no editor, inquilino no link)
- O locador escolhe o que exigir do inquilino: assinatura, selfie, ou ambas
- Aceite registra data/hora, IP, coordenadas de GPS, *user agent* e hash SHA-256 do conteúdo
- Certificado de assinatura anexado ao PDF com essas evidências

**Módulos de gestão**
- **Imóveis** com status automático (Alugado/Disponível derivado do contrato ativo), busca de CEP e receita por imóvel
- **Clientes** cadastrados automaticamente a partir do contrato, idempotente por CPF/CNPJ
- **Painel de administrador**: ficha de suporte de todas as contas, somente leitura

**Outros**
- Exportação em PDF pela impressão nativa do navegador
- Tema claro/escuro

---

## Stack

HTML, CSS e JavaScript puros — **sem framework e sem build step**.

- Front: scripts globais com `<script defer>` em ordem fixa, cache-busting manual por querystring — **nenhuma dependência de runtime**
- Backend próprio em `server/`: **Node + Express + `node:sqlite`** — uma dependência, banco num arquivo (`data.db`), sem serviço externo
- Senha (`scrypt`), sessão e hash vêm do `node:crypto`; não há biblioteca de autenticação
- Criptografia: WebCrypto (`crypto.subtle`) nativo do navegador
- CSP em `<meta>` no `public/app.html` + cabeçalhos de segurança enviados por `server/index.js`

---

## Modelo de dados

| Tabela | Conteúdo | Acesso |
|---|---|---|
| `contracts` | contratos do locador, campos em JSON | privado por `auth.uid()` |
| `profiles` | perfil do locador, dados em JSON | privado por `auth.uid()` |
| `properties`, `clients`, `financial_records` | módulos de gestão, colunas tipadas | privado por `auth.uid()` |
| `tenant_links` | payload cifrado dos links públicos | apenas via RPC, enquanto não expirado |

`tenant_links` nunca é acessada diretamente — só pelas RPCs `create_tenant_link`, `set_tenant_link` e `get_tenant_link`.

> [!WARNING]
> **O que separa uma conta da outra é código, não o banco.** Até 26/08 era a RLS do Postgres — uma parede que valia mesmo se o servidor errasse. Agora é o middleware de escopo em `server/rotas/recursos.js`: toda rota de recurso exige sessão e todo SQL leva `user_id` da sessão, nunca do cliente. Por isso mudança ali **exige teste de escopo junto** — os 34 casos de `server/servidor.test.js` são essa garantia sendo cobrada. Ver `docs/ARQUITETURA.md` §7 e R5.
>
> `data.db` está no `.gitignore` e contém `cloud_key` em claro (a chave AES dos links do inquilino). Quem tem o arquivo decifra os contratos: trate-o como segredo.

---

## Rodando localmente

Não há instalação nem build. Mas **não abra por `file://`** — a CSP e o `crypto.subtle` exigem contexto seguro. Suba um servidor estático:

**Requer Node 24** (ou 22.5+): o backend usa `node:sqlite`, que não existe antes disso.

```bash
npm install     # uma dependência: express
npm start       # http://localhost:3000
```

Depois acesse `http://localhost:3000/` (landing) ou `http://localhost:3000/app.html` (aplicação). `npm run dev` reinicia o servidor a cada alteração.

O banco (`data.db`) é criado no primeiro boot, com o schema completo — não há passo de provisionamento e não há sistema de migration. **A primeira conta cadastrada vira administradora**; as seguintes, não.

### Variáveis de ambiente

Nenhuma é obrigatória — o sistema sobe sem definir nenhuma, e é assim que se
roda local. Elas existem para o dia em que houver um servidor de verdade.

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta do servidor. |
| `DB_FILE` | `./data.db` | Caminho do banco. Os testes apontam para um arquivo descartável. |
| `UPLOADS_DIR` | `./uploads` | Pasta das fotos e vídeos de vistoria. |
| `HTTPS` | *(vazio)* | Qualquer valor liga a flag `Secure` no cookie de sessão. **Ligue assim que houver HTTPS**: sem ela, o cookie trafega em claro. |
| `TRUST_PROXY` | `false` | Só defina se houver um proxy reverso na frente (`1`, `loopback`, ou o IP dele). Com isso ligado sem proxy, qualquer um forja o IP do aceite mandando `X-Forwarded-For`. |

### Backup são duas coisas

`data.db` guarda os registros; `uploads/` guarda as fotos e vídeos das vistorias.
Copiar só um dos dois restaura vistorias com mídia quebrada — a linha aponta para
um arquivo que não existe mais. Copie os dois juntos.

> **Não há deploy configurado.** A Vercel serve estático e funções sem estado; um processo com banco em arquivo não roda lá. Hospedar exige host com disco persistente — decisão pendente, registrada em `docs/ARQUITETURA.md`.

Testes — não exigem instalação, é Node puro:

```bash
npm test          # roda os 6 checks
```

---

## Estrutura

```
public/                 tudo que o navegador recebe
  index.html            landing page
  app.html              aplicação (SPA com router por hash)
  termos.html           termos de uso e política de privacidade (LGPD)
  fonts/                fontes auto-hospedadas (woff2)
  css/                  um arquivo por área
  data/contracts.js     3 modelos embutidos (residencial, comercial, minuta simples)
  js/
    api.js              fala com /api — substituiu o cliente da Supabase
    app.js              rotas, bootstrap e importação do contrato preenchido
    auth.js             login e cadastro PF/PJ
    editor.js           formulário, preview e geração do link cifrado
    tenant-v2.js        fluxo do inquilino
    database.js         criptografia e rotas dos links
    storage.js          cache e CRUD (contratos, imóveis, clientes, financeiro, vistorias, perfil)
    utils.js            máscaras, validação, datas, status, preview do contrato, PDF
    dashboard.js        métricas          contracts.js  lista de contratos
    financeiro.js       cobranças         renovacoes.js vencimentos e reajustes
    vistorias.js        estado do imóvel  templates.js  seleção de modelos
    properties.js       imóveis           clients.js    clientes
    admin.js            perfil do locador e exclusão de conta
    superadmin.js       painel de todas as contas (somente leitura)
    *.test.js           checks em Node puro, sem framework

server/                 o backend
  index.js              Express, rotas, estático e cabeçalhos de segurança
  db.js                 schema no boot + mapa RECURSOS (a lista branca de tabelas)
  sessao.js             scrypt, cookie de sessão, exigirLogin/exigirAdmin
  rotas/                auth · perfil · recursos · links · admin
  servidor.test.js      34 casos por HTTP, em banco descartável

data.db                 o banco (gitignored)
docs/ARQUITETURA.md     a linha do sistema: regras, dívidas e processo
```

---

## Limitações conhecidas

- **3 modelos** de contrato embutidos, sem UI para criar modelos próprios.
- A assinatura é **eletrônica simples**: manuscrita em canvas, com aceite e trilha de evidências (data/hora, IP, GPS, hash SHA-256, selfie opcional). **Não é assinatura qualificada (ICP-Brasil)** e não usa certificado digital.
- Escritas no servidor são otimistas: o cache local muda primeiro e a gravação segue sem `await`. A falha avisa o usuário — distinguindo recusa do servidor de queda de conexão —, mas não há *rollback* automático.
- Cobertura de testes concentrada nas funções puras e na superfície de segurança; editor, inquilino e autenticação não têm teste.
- Sem linter.

---

## Propriedade intelectual

**AVISO LEGAL**

O código-fonte, a arquitetura, o design de interface, as lógicas de negócio e toda a estrutura deste software são de propriedade intelectual exclusiva e protegida de seus criadores.

- **Acesso e contribuição restritos:** apenas desenvolvedores e colaboradores explicitamente convidados e autorizados pelos proprietários têm permissão para visualizar, realizar *commits* ou alterar o código deste repositório.
- **Nenhuma alteração autorizada por terceiros:** não é permitido fazer *fork*, copiar, modificar, distribuir, fazer engenharia reversa ou reutilizar qualquer parte deste código-fonte sem autorização prévia, expressa e documentada.
- **Proteção comercial:** é estritamente proibida a reprodução parcial ou total deste sistema para fins comerciais, acadêmicos ou pessoais por indivíduos não autorizados.

> Todo o conteúdo deste repositório está amparado pelas leis de proteção aos Direitos Autorais e de Propriedade Intelectual em vigor. Qualquer violação dos termos acima estará sujeita às sanções civis e penais cabíveis.

Termos completos em [LICENSE](LICENSE).

---

*Desenvolvido por Allan de Oliveira e Theo Carvalho.*
