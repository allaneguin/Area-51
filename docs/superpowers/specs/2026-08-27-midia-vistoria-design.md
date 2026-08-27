# Fotos e vídeos por ambiente na vistoria

**2026-08-27.** Dar a cada ambiente de uma vistoria as suas fotos e um vídeo
curto, e reorganizar a tela de detalhe em volta disso.

---

## 1. Decisão e contexto

A vistoria existe para sustentar uma conversa que acontece meses depois: reter
ou devolver a caução. Hoje ela registra só texto — estado (`Bom`/`Regular`/`Ruim`)
e observação por ambiente. Texto contra texto é a palavra de um contra a do
outro; foto e vídeo são o que muda essa conversa de lugar.

Três escolhas foram tomadas explicitamente pelo dono do projeto:

| Questão | Decisão |
|---|---|
| Escopo | **Foto e vídeo curto**, com teto de tamanho. Não é "foto agora, vídeo depois". |
| Onde os bytes ficam | **Pasta `uploads/` no disco.** O banco guarda só o nome do arquivo. |
| Como se captura | **Câmera dentro da página** (`getUserMedia`/`MediaRecorder`), não só seletor de arquivo. |

Nos dois últimos a recomendação era outra (blob no `data.db`; `input type=file`
com `capture`). O dono decidiu, e as consequências de cada uma estão registradas
abaixo como trabalho a fazer — não como ressalva.

### O que o repositório já tem, e que este trabalho usa

- **Precedente de imagem**: assinatura e selfie do inquilino já são base64 num
  campo JSON. A selfie real do banco tem **30 KB** — ela passa por um `canvas`
  que reduz antes de virar `dataURL`. É esse mesmo truque que a foto de vistoria
  usa, com outro teto.
- **Precedente de expurgo**: `tenant_links` não tem agendador; quem apaga o
  expirado é a própria leitura (`expurgar()` em `rotas/links.js`). A varredura de
  arquivo órfão segue o mesmo desenho.
- **Precedente de rota fora do CRUD genérico**: `profiles` não está em
  `RECURSOS` porque viraria exceção dentro do middleware de escopo. `midias`
  fica de fora pela mesma razão, com um motivo a mais (abaixo).

### O que não existe e precisa nascer

Não há armazenamento de arquivo em lugar nenhum do sistema. O teto de corpo é
`express.json({ limit: '1mb' })`, e a linha inteira da vistoria é reescrita a
cada tecla digitada nas observações — guardar mídia dentro de `inspections.rooms`
somaria megabytes a cada `PUT`. Por isso mídia é tabela e rota próprias.

---

## 2. Banco

Tabela nova em `server/db.js`, criada no boot como as demais:

```sql
create table if not exists midias (
  id            text primary key,
  user_id       text not null references users(id) on delete cascade,
  inspection_id text not null references inspections(id) on delete cascade,
  ambiente      integer not null,
  tipo          text not null,           -- 'foto' | 'video'
  mime          text not null,
  bytes         integer not null,
  arquivo       text not null,           -- nome no disco: <id>.<ext>
  created_at    text not null
);
create index if not exists midias_vistoria_idx on midias (inspection_id, ambiente);
```

**`midias` NÃO entra no mapa `RECURSOS`.** O CRUD genérico grava o que o corpo
mandar nas colunas declaradas: o cliente poderia escrever `arquivo`, `bytes` e
`mime` à vontade — inclusive apontar `arquivo` para o nome de um arquivo de
outra conta e ler pela rota de leitura. Nome de arquivo no disco é decisão do
servidor, nunca do corpo do pedido.

**`ambiente` é o índice do ambiente dentro de `inspections.rooms`.** É um índice
posicional, e isso tem uma consequência que o código precisa honrar: **remover um
ambiente do meio da lista desloca os índices seguintes**. `Vistorias.removerAmbiente`
passa a reindexar as mídias dos ambientes posteriores na mesma operação. A
alternativa (dar id próprio a cada ambiente) mudaria o formato de `rooms` em
vistorias que já existem, e o ganho não paga a migração de dado.

---

## 3. Rotas — `server/rotas/midias.js`

Todas atrás de `router.use(exigirLogin)`, primeira linha do arquivo, como em
`recursos.js`. Todo SQL leva `user_id` da sessão.

### `POST /api/midias?vistoria=<id>&ambiente=<i>&tipo=foto|video`

Corpo **cru** — `express.raw({ type: [lista branca de mime], limit: '25mb' })`,
montado só nesta rota. Não há multipart e não entra dependência para isso: o
cliente manda `fetch(url, { method: 'POST', body: blob })` e o `Content-Type` do
próprio arquivo diz o que é. Multer resolveria o que uma linha resolve.

Validações, nesta ordem:

1. A vistoria existe **e é da sessão** (`select user_id from inspections`).
2. `tipo` é `foto` ou `video`.
3. `Content-Type` está na lista branca: `image/jpeg`, `image/png`, `image/webp`
   para foto; `video/webm`, `video/mp4`, `video/quicktime` para vídeo. Mime fora
   da lista é 415, e o `express.raw` já recusa antes de alocar o corpo.
4. Tamanho: **8 MB** para foto, **25 MB** para vídeo.
5. Quantidade por ambiente: **8 fotos e 2 vídeos**. Sem teto, um ambiente engole
   o disco e ninguém percebe até acabar.

Grava `uploads/<id>.<ext>` e a linha, nesta ordem — arquivo primeiro, linha
depois: linha sem arquivo é um cartão quebrado na tela, arquivo sem linha é lixo
que a varredura recolhe.

### `GET /api/midias?vistoria=<id>`

Lista as mídias da vistoria (sem bytes): id, ambiente, tipo, mime, bytes,
created_at. Só do dono.

### `GET /api/midias/:id/arquivo`

Devolve o arquivo com `res.sendFile` — que já trata `Range`, e é o que o
`<video>` usa para buscar no meio sem baixar tudo. `Cache-Control: private`.

**Nunca uma pasta estática.** Foto do imóvel de um cliente com nome adivinhável
seria vazamento por URL: quem tem o nome tem a foto, sem sessão nenhuma.

### `DELETE /api/midias/:id`

Apaga a linha e o arquivo. 404 tanto para "não existe" quanto para "é de outro",
como no `recursos.js` — distinguir os dois conta que aquele id existe.

### Varredura de órfão

`varrer()` — lista `uploads/`, apaga o que não tem linha correspondente. Roda no
POST e no GET da lista, não em agendador. É o mesmo desenho do `expurgar()` dos
links, e é o que resolve o efeito colateral da escolha "arquivo no disco": a
cascata do SQLite apaga a linha quando a vistoria morre, mas o disco não sabe
disso.

---

## 4. CSP e front

`public/app.html` ganha `media-src 'self' blob:` — hoje a diretiva não existe, e
`default-src 'self'` faz o navegador **bloquear** vídeo `blob:`. O `'self'` é
para o vídeo já salvo (servido pela nossa rota); o `blob:` é para o preview da
gravação, antes de subir.

### `public/js/midias.js` (novo)

- **Foto**: `getUserMedia` → `<video>` de preview → `canvas` reduzido para no
  máximo 1600 px na maior dimensão → `toBlob('image/jpeg', 0.75)`. Deve cair na
  casa de 200–400 KB, contra 3–5 MB do arquivo original do celular.
- **Vídeo**: `MediaRecorder` com `video/webm` (ou `video/mp4` onde for o
  suportado), **corte automático em 30 s** e verificação de tamanho antes de
  subir.
- **Fallback obrigatório para `input type=file`**: câmera na página falha em
  contexto não-seguro (o sistema roda em `http://` fora de `localhost`), com
  permissão negada e em máquina sem câmera. Sem o fallback a feature
  simplesmente não existe nesses casos — e é assim que a selfie do inquilino já
  se protege hoje.
- Upload, listagem e exclusão falando com as rotas acima.

### `public/js/vistorias.js`

Cada ambiente ganha a faixa de mídia; o visualizador é um modal simples
(`.modal-backdrop`, o mesmo dos cadastros) com a foto ou o `<video controls>`.

**De onde a lista vem:** `renderDetalhe` busca `GET /api/midias?vistoria=<id>` ao
abrir a vistoria e guarda no próprio módulo. **Não entra no cache do `Storage`**,
que é o espelho das cinco tabelas do CRUD genérico — enfiar mídia lá faria
`loadCloudData` baixar a lista de mídia de todas as vistorias a cada login, para
uma tela que quase nunca está aberta.

**Falha no meio do caminho:** a miniatura só aparece depois da resposta de
sucesso. Enquanto sobe, o cartão mostra o progresso; se falhar, mostra o erro e
some. A tela nunca exibe mídia que o servidor não confirmou — é a mesma regra do
`Storage._cloudWrite`, onde falha de escrita não é silenciosa, invertida: aqui
nem chega a existir localmente antes de existir no servidor.

---

## 5. Reorganização da tela de detalhe

O cartão de ambiente hoje gasta cerca de 300 px de altura com um `select` e um
`textarea` vazio de três linhas. Numa vistoria de cinco ambientes, o locador
rola a tela inteira para ver o que cabia em uma.

- **Estado vira três botões** (`Bom`/`Regular`/`Ruim`) no lugar do `select`: um
  toque em vez de dois, e a cor comunica antes da leitura.
- **Faixa de miniaturas** com "+ Foto" e "+ Vídeo" no próprio cartão.
- **Observações em campo de 2 linhas que cresce** conforme se escreve.
- **Aside**: o Resumo continua, e ganha "3 de 5 ambientes com mídia" — que é a
  pergunta real de quem está vistoriando ("já cobri tudo?").
- **Vistoria fechada**: tudo em leitura, mídia continua visível. É o mesmo
  princípio do `setCampo`: o valor de prova vem de não dar para reescrever
  depois.

---

## 6. Testes

**Servidor** (`server/servidor.test.js`, no estilo dos que já existem — sobem o
app num banco descartável e falam por HTTP):

1. Toda rota de mídia exige sessão.
2. B não lê, não lista e não apaga mídia de A; B não sobe mídia para vistoria de A.
3. Mime fora da lista branca é recusado.
4. Acima do teto é recusado (foto e vídeo têm tetos diferentes).
5. Estourar a quantidade por ambiente é recusado.
6. Apagar a vistoria leva as linhas de mídia junto (cascata) e a varredura
   recolhe os arquivos.
7. `GET /:id/arquivo` devolve os bytes que subiram, com o mime que subiu.

**Front**: a captura é DOM e mídia do navegador — não tem seam de teste
automatizado honesto aqui. Vale a regra do `ARQUITETURA.md` para telas sem
cobertura: **auditoria de runtime**, com o resultado no CHANGELOG. A reindexação
de `ambiente` ao remover um ambiente do meio é lógica pura e **tem** teste, em
`vistorias.test.js`.

---

## 7. Consequências registradas

- **Backup virou duas coisas.** `data.db` sozinho não restaura mais uma vistoria
  completa: sem `uploads/`, as fotos somem e sobram cartões quebrados. Vai para o
  `README.md` e para a Parte III do `ARQUITETURA.md`.
- **`uploads/` entra no `.gitignore`.** Foto de imóvel de cliente não é artefato
  de repositório.
- **O disco agora tem dono.** Com 8 fotos e 2 vídeos por ambiente e 5 ambientes,
  uma vistoria pode chegar a ~250 MB. Não há cota por conta neste trabalho; é
  aceitável enquanto o sistema roda local e de dono único, e passa a não ser no
  dia em que houver deploy multiusuário. Fica registrado como pendência, não como
  surpresa.
- **PDF da vistoria não entra neste trabalho.** Não existe exportação de vistoria
  hoje (`generatePDF` é `window.print()`, e a tela de vistoria não o chama). Foto
  em folha impressa é trabalho próprio, e vídeo não existe em papel.
