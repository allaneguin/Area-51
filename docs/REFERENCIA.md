# Referência — regras de negócio e API

**2026-08-27.** O que o sistema faz hoje, e por qual porta se fala com ele.

Este documento é **descritivo**: descreve o comportamento que está no código e
coberto por teste, não o desejado. Onde o código mudar, ele muda junto — e o
`CHANGELOG.md` diz por quê.

Os outros três documentos, para não procurar no lugar errado:

| Documento | Para quê |
|---|---|
| `docs/ARQUITETURA.md` | As **regras de como se escreve** aqui (R1–R9) e as dívidas abertas (Parte III) |
| `arquitetura_sistema.md` | Os **diagramas**: camadas, fluxo do inquilino, modelo de dados |
| `README.md` | Como **rodar**, e o que faz backup |

---

# Parte I — Requisitos funcionais e regras de negócio

## 1. Contas e sessão

| Regra | Valor | Onde vive |
|---|---|---|
| **A primeira conta cadastrada vira administradora** | as seguintes, não | `rotas/auth.js` |
| Senha mínima | 6 caracteres | `MIN_SENHA` |
| E-mail | único, sem diferenciar maiúsculas (`collate nocase`) | schema |
| Sessão | cookie `httpOnly`, `sameSite: strict`, 30 dias | `sessao.js` |
| `Secure` no cookie | **só quando `HTTPS` está definida** | `sessao.js` |
| Trocar a senha | derruba as **outras** sessões, não a atual | teste |
| Excluir a conta | exige a senha, e leva todos os dados junto (cascata) | teste |
| Tentativas de login | 5/min por IP; cadastro, 10/hora | `limite.js` |

Não existe confirmação de e-mail nem redefinição de senha: não há serviço de
envio. **Quem esquece a senha perde a conta** — é a maior lacuna operacional
aberta, registrada na análise de 27/08.

## 2. Contratos

- **Três modelos** (`data/contracts.js`): residencial, comercial e minuta
  simples. O modelo define quais campos existem; o contrato guarda os valores
  num único objeto `fields`.
- **O status nunca é digitado — é derivado das datas** (`Utils.getContractStatus`):
  `A Iniciar` antes do início, `Ativo` durante, `Vencido` depois, e `Pendente`
  quando falta início ou término. Status na mão envelhece e passa a mentir.
- `data_termino` = `data_inicio` + prazo − 1 dia (começa 01/06, termina 31/05).
- **Contrato finalizado é só leitura.** `is_finalized` vira verdadeiro quando o
  inquilino assina, e a tela toda passa a modo de consulta.
- **Salvar um contrato cadastra o inquilino em Clientes**, se houver nome e
  CPF/CNPJ. É idempotente (casa pelo documento) e **nunca sobrescreve** um
  cadastro existente: dado editado à mão pelo locador tem prioridade.
- **Contrato de teste** (só rodando local): cria um contrato com todos os campos
  preenchidos, para não digitar 40 campos a cada teste do fluxo do inquilino.

## 3. Link do inquilino — a parte mais sensível do sistema

O inquilino não tem conta. Ele recebe uma URL com o id do link e a chave no
**fragmento** (`#tenant?id=…&key=…`), que o navegador não manda em requisição
nem em `Referer`.

- **O servidor nunca vê o conteúdo.** O payload é cifrado em AES-256-GCM no
  navegador do locador. O que está guardado é opaco.
- **Prova de chave**: o cliente manda `SHA-256(chave)`; o servidor guarda
  `SHA-256` disso. Quem lê o banco não consegue escrever no link.
- **Tetos**: payload 512 KB, 100 links por conta por dia, validade 30 dias — e
  **7 dias depois de assinado**, o bastante para o locador importar.
- **`finalized` é caminho só de ida.** Depois do envio, ninguém reescreve o
  payload, mesmo com a URL inteira.
- **Lista branca na ingestão**: do que o inquilino devolve, só entram no contrato
  do locador os campos da seção *Locatário* e os da trilha de aceite
  (assinatura, selfie, hash, IP, GPS, user agent). Um payload adulterado com
  `conta_locador` ou `valor_aluguel` é descartado — a regra vale na **ingestão**,
  não na tela.
- **O carimbo do servidor vence o autodeclarado**: data e IP do aceite vêm de
  `tenant_links`, gravados pelo servidor, e sobrescrevem qualquer coisa que o
  payload traga com esses nomes.
- **Porta de saída**: não se gera link sem valor do aluguel, endereço, data de
  início, prazo e dia de vencimento — **cobrando só o que o modelo tem**
  (`Utils.faltamParaOLink`).

## 4. Vistorias

- Uma vistoria pertence a **um imóvel** e é de **Entrada** ou **Saída**; o
  inquilino vem do contrato ativo daquele imóvel.
- **A saída herda os ambientes da última entrada fechada** do mesmo imóvel:
  comparar exige os dois lados com a mesma lista. Estado e observação não vêm
  junto — são o que a saída vai constatar.
- Estado por ambiente: `Bom`, `Regular` ou `Ruim`, com observação livre.
- **Fechada é só leitura** (momento, data e ambientes travam). Reabrir devolve
  ao rascunho. É de não dar para reescrever depois que vem o valor de prova.
- **Mídia por ambiente**: até 8 fotos (8 MB cada) e 2 vídeos (25 MB, gravação
  cortada em 30 s). Foto é reduzida para 1600 px antes de subir.
- Remover um ambiente **reindexa as mídias** dos seguintes — senão a foto da
  cozinha passa a ilustrar a sala.

## 5. Financeiro

- "Gerar cobranças do mês" cria **uma linha por contrato ativo com valor**.
- **Vencimento** = o `dia_vencimento` do contrato, e **nunca antes da data de
  início** (contrato que começa dia 27 não gera cobrança vencida em 10).
- O banco só conhece `Pendente` e `Pago`; **"Atrasado" é derivado** do
  vencimento contra hoje.
- Não há envio de cobrança por e-mail ou WhatsApp: a tela controla o recebido e
  gera o CSV; o aviso ao inquilino sai por você.

## 6. Imóveis e clientes

- **O status "Alugado" é derivado** de haver contrato ativo vinculado. Sem
  contrato ativo, vale o status manual (Disponível / Em Manutenção / Reservado).
- O imóvel acumula histórico: quantos contratos já teve e quanto já recebeu.

## 7. Administração

- Só a primeira conta. O admin lê contratos, perfis e usuários de todas as
  contas, **mas nunca a `cloud_key`** (garantido por teste).
- **O admin não acessa o ERP**: não existe rota de administração para imóvel,
  cliente, financeiro ou vistoria. Supervisão de contas não é acesso ao negócio
  alheio — decisão registrada, e virou teste.

---

# Parte II — Contrato de API

Base: `/api`. Tudo fala JSON, exceto o upload de mídia (corpo binário cru) e a
leitura de arquivo (bytes).

**Sessão** viaja em cookie `httpOnly` — não há token para mandar em cabeçalho.
Rota autenticada sem sessão responde **401**; nunca 403, e nunca redireciona.

**Erro** tem sempre a mesma forma: `{ "erro": "frase em português" }`.

## Contas — `/api/auth`

| Método | Rota | Corpo | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/registrar` | `{email, senha}` | `201 {user}` | 400 (e-mail/senha inválidos), 409 (e-mail em uso), **429** (10/h) |
| POST | `/entrar` | `{email, senha}` | `200 {user}` | 401 (credenciais), **429** (5/min) |
| POST | `/sair` | — | `200 {ok}` | — |
| GET | `/sessao` | — | `200 {user}` ou `{user:null}` | — |
| PUT | `/senha` | `{senha}` | `200 {ok}` | 400, 401, 429 |
| DELETE | `/conta` | `{senha}` | `200 {ok}` | 401 (senha errada), 429 |

`user` = `{ id, email, is_admin }`. **Nunca** sai `senha_hash` nem `salt`.

## Recursos (CRUD genérico) — `/api/:recurso`

Recursos válidos, e **só estes**: `contracts`, `properties`, `clients`,
`financial_records`, `inspections`. Nome fora da lista é **404** e não vira SQL.

| Método | Rota | Corpo | Sucesso | Erros |
|---|---|---|---|---|
| GET | `/:recurso` | — | `200 [linhas da sessão]` | 401, 404 (recurso desconhecido) |
| PUT | `/:recurso/:id` | a linha (parcial) | `200 {linha}` | 401, 403 (id de outra conta), 404 |
| DELETE | `/:recurso/:id` | — | `200 {ok}` | 401, 404 |

- O `id` vem da URL e o `user_id` da **sessão**: o que o corpo disser sobre os
  dois é ignorado.
- `created_at` é imutável — o upsert reusa o valor da linha existente.
- `fields` (contratos) e `rooms` (vistorias) saem como **objeto/array**, não
  string: a conversão acontece na borda do servidor.
- `is_finalized` sai como **boolean**, não 0/1.

## Perfil do locador — `/api/perfil`

| Método | Rota | Corpo | Sucesso |
|---|---|---|---|
| GET | `/` | — | `200 {…}` (vazio `{}` se não houver) |
| PUT | `/` | o perfil | `200 {…}` |

Não tem `:id`: a chave primária **é** o usuário. Por isso ficou fora do CRUD
genérico — seria exceção dentro do middleware que garante o escopo.

## Link do inquilino — `/api/links`

As três últimas são **públicas por definição** (o inquilino não tem conta).

| Método | Rota | Corpo | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/` (exige sessão) | `{id, payload, key_proof}` | `201 {ok}` | 400, 401, 413 (>512 KB), 429 (100/dia) |
| GET | `/:id` | — | `200 {payload}` | 404 (inexistente/expirado), **429** (30/min) |
| GET | `/:id/evidencia` | — | `200 {evidencia}` | 404, 429 |
| PUT | `/:id` | `{payload, key_proof, finalize}` | `200 {gravou: true\|false}` | 413, **429** (20/min) |

**`gravou: false` não é erro HTTP, e isso é de propósito.** Recusa (link
expirado, já finalizado, prova errada) e falha de rede pedem reações opostas de
quem chama: só numa delas o link deve ser descartado. Um 4xx genérico
confundiria as duas.

Link expirado **some na leitura** — é o que substituiu o agendador.

## Mídia da vistoria — `/api/midias`

Todas exigem sessão.

| Método | Rota | Corpo | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/?vistoria=&ambiente=&tipo=` | **bytes crus**, `Content-Type` do arquivo | `201 {id, ambiente, tipo, mime, bytes, created_at}` | 400, 404 (vistoria não é sua), 409 (quantidade), 413 (tamanho), 415 (formato) |
| GET | `/?vistoria=` | — | `200 [linhas]` | 401 |
| GET | `/:id/arquivo` | — | `200` bytes (aceita `Range`) | 401, 404 |
| POST | `/reindexar` | `{vistoria, removido}` | `200 {ok}` | 400, 404 |
| DELETE | `/:id` | — | `200 {ok}` | 401, 404 |

`tipo` é `foto` ou `video`. Formatos: JPEG/PNG/WEBP e WEBM/MP4/MOV.
**Não há pasta estática**: o arquivo passa por sessão. Nome adivinhável vazaria
foto de imóvel de cliente por URL.

## Administração — `/api/admin`

Exigem sessão **e** `is_admin`. Não-admin recebe **403**.

| Método | Rota | Sucesso |
|---|---|---|
| GET | `/contracts` | `200 [contratos de todas as contas, sem `cloud_key`]` |
| GET | `/profiles` | `200 [perfis]` |
| GET | `/users` | `200 [contas]` |

Não existe rota de admin para imóvel, cliente, financeiro ou vistoria — e a
ausência é testada.

---

# Parte III — O que este documento não cobre

- **Como se escreve código aqui** (nomes, CSS, testes, versionamento de assets):
  `docs/ARQUITETURA.md`, R1–R9.
- **Dívidas abertas e por que ficaram**: `docs/ARQUITETURA.md`, Parte III.
- **Diagramas**: `arquitetura_sistema.md`.
- **Histórico de decisões**: `CHANGELOG.md` — uma seção por dia, com o hash do
  commit.
