# Arquitetura do Sistema — Diagramas e Fluxos

**Versão 2.1 — 2026-08-28.** Os diagramas do sistema: camadas, o ciclo do link
do inquilino, o modelo de dados e os estados.

> **Os nomes aqui são os nomes reais das colunas e das rotas.** Diagrama que
> renomeia campo para ficar mais bonito ("title" em vez de `name`, "amount" em
> vez de `rent_value`) é pior que diagrama nenhum: quem confia nele escreve
> código que não roda, e quem descobre isso passa a não confiar em documento
> algum. A referência é `server/db.js` e `server/rotas/`; quando divergirem,
> quem está errado é este arquivo.
>
> Este documento tem irmãos: `docs/ARQUITETURA.md` (as regras e as dívidas),
> `docs/REFERENCIA.md` (regras de negócio e contrato de API) e o `CHANGELOG.md`
> (por que cada coisa é assim).

---

## 1. Camadas e comunicação

Separação de responsabilidades (R2 do `ARQUITETURA.md`): front sem build,
servidor Express, e persistência em **duas** partes — o banco em arquivo e o
diretório de mídia.

```mermaid
flowchart TD
    subgraph Browser ["Navegador (public/)"]
        App["Shell & Router (app.js)"]
        Views["Views (editor, dashboard, vistorias, tenant, …)"]
        Utils["Núcleo puro + UI (utils.js)"]
        Storage["Cache e CRUD (storage.js)"]
        CloudDB["AES-GCM e sanitização (database.js)"]
        Midias["Captura e upload (midias.js)"]
        ApiFront["Transporte (api.js)"]

        App --> Views
        Views --> Utils
        Views --> Storage
        Views --> CloudDB
        Views --> Midias
        Storage --> ApiFront
        CloudDB --> ApiFront
        Midias --> ApiFront
    end

    subgraph Server ["Backend Node (server/)"]
        Express["index.js — estático, CSP e cabeçalhos"]

        subgraph Rotas ["Routers em /api"]
            AuthRoutes["/auth — limite por rota"]
            LinksRoutes["/links — PÚBLICO + limite por rota"]
            PerfilRoutes["/perfil — exigirLogin"]
            RecursosRoutes["/:recurso — exigirLogin"]
            MidiasRoutes["/midias — exigirLogin"]
            AdminRoutes["/admin — exigirLogin + exigirAdmin"]
        end

        DBModule["db.js — schema, mapa RECURSOS, conversão de borda"]
    end

    subgraph Disco ["Persistência local"]
        SqliteDB[("data.db")]
        UploadsDir[("uploads/ — fotos e vídeos")]
    end

    ApiFront -- "HTTP/JSON + cookie httpOnly" --> Express
    Express --> Rotas
    Rotas --> DBModule
    DBModule --> SqliteDB
    MidiasRoutes --> UploadsDir
```

**Onde a proteção mora, e por que não é uma pilha global:** `exigirLogin` é a
**primeira linha de cada router** que precisa dele (`router.use`), não um
middleware antes de tudo — `/api/links` e `/api/auth/entrar` são públicos por
definição, e uma pilha global precisaria de exceções, que é onde o furo nasce.
O limite por IP (`limite.js`) é montado **na definição da rota**, e só nas que
podem ser marteladas: login, cadastro e as rotas públicas de link.

---

## 2. Ciclo do link do inquilino (ponta a ponta)

O servidor nunca vê o conteúdo: ele guarda bytes cifrados no navegador do
locador e decifrados no do inquilino. A chave viaja no **fragmento** da URL,
que não vai em requisição nem em `Referer`.

```mermaid
sequenceDiagram
    autonumber
    actor Locador
    participant FrontL as Navegador do locador<br/>(CloudDB + WebCrypto)
    participant Srv as Servidor<br/>(/api/links)
    participant DB as SQLite<br/>(tenant_links)
    actor Inquilino
    participant FrontI as Navegador do inquilino<br/>(tenant-v2.js)

    Note over Locador,FrontL: 1. Geração
    Locador->>FrontL: "Gerar link do inquilino"
    FrontL->>FrontL: recusa se faltar valor, endereço,<br/>início, prazo ou dia de vencimento
    FrontL->>FrontL: chave CSPRNG (16 chars) · id UUID<br/>AES-256-GCM (IV de 12 bytes)<br/>key_proof = SHA-256(chave)
    FrontL->>Srv: POST /api/links {id, payload, key_proof}
    Srv->>Srv: id já existe? → 409 (não sobrescreve)
    Srv->>DB: INSERT (guarda SHA-256 DA PROVA, expires_at = +30 dias)
    Srv-->>FrontL: 201
    FrontL->>FrontL: grava cloud_id e cloud_key NO CONTRATO
    FrontL-->>Locador: .../c#tenant?id={id}&key={chave}

    Note over Locador,Inquilino: link vai por WhatsApp — a chave está no fragmento

    Inquilino->>FrontI: abre a URL
    FrontI->>Srv: GET /api/links/:id
    Srv->>DB: SELECT … WHERE id = ? (expirado some na leitura)
    Note right of Srv: NÃO filtra finalized:<br/>ler link assinado é o que<br/>permite o locador importar
    Srv-->>FrontI: 200 {payload}
    FrontI->>FrontI: decifra com a chave do fragmento<br/>sanitiza data: URLs na fronteira

    Note over Inquilino,FrontI: 2. Preenchimento e aceite
    Inquilino->>FrontI: dados, assinatura e selfie
    FrontI->>FrontI: aceite_ts, user_agent, IP e GPS (autodeclarados)<br/>aceite_hash = SHA-256(texto lido)
    FrontI->>Srv: PUT /api/links/:id {payload, key_proof, finalize: true}
    Srv->>Srv: SHA-256(key_proof) bate com o guardado?
    Srv->>DB: UPDATE … finalized = 1, finalized_at, finalized_ip,<br/>expires_at encurtado para +7 dias
    Srv-->>FrontI: 200 {gravou: true}
    Note right of Srv: gravou:false (não erro HTTP) quando<br/>expirado, já finalizado ou prova errada

    Note over Locador,DB: 3. Ingestão
    alt Contrato ainda tem cloud_id (caminho normal)
        Locador->>FrontL: abre o contrato no editor
        FrontL->>Srv: GET /links/:id + GET /links/:id/evidencia
        Srv-->>FrontL: payload cifrado + carimbo do servidor
    else Locador usa o link de importação (#import)
        Locador->>FrontL: cola .../c#import?id={id}&key={chave}
    end
    FrontL->>FrontL: LISTA BRANCA: só a seção Locatário<br/>e a trilha de aceite entram
    FrontL->>FrontL: carimbo do servidor (data/IP) vence o autodeclarado
    FrontL->>Srv: PUT /api/contracts/:id {fields, is_finalized: true}
```

---

## 3. Modelo de dados

Nove tabelas em `data.db`. **Os nomes abaixo são os do `pragma table_info`.**
O escopo por conta é da aplicação, não do banco: não há RLS — quem garante é
`user_id` da sessão em todo SQL, e os testes de escopo são a cobrança disso.

```mermaid
erDiagram
    users ||--o{ sessions : "possui"
    users ||--o| profiles : "possui"
    users ||--o{ contracts : "cria"
    users ||--o{ properties : "gerencia"
    users ||--o{ clients : "cadastra"
    users ||--o{ financial_records : "lança"
    users ||--o{ inspections : "realiza"
    users ||--o{ tenant_links : "gera"
    inspections ||--o{ midias : "documenta"

    users {
        TEXT id PK "UUID do servidor — o cliente não escolhe identidade"
        TEXT email UK "collate nocase"
        TEXT senha_hash "scrypt"
        TEXT salt "16 bytes por usuário"
        INTEGER is_admin "a primeira conta nasce 1"
        TEXT criado_em "ISO-8601"
        TEXT ultimo_login "ISO-8601"
    }

    sessions {
        TEXT token PK "cookie httpOnly, SameSite=Strict"
        TEXT user_id FK "users(id) ON DELETE CASCADE"
        TEXT expira_em "30 dias; expirada some na leitura"
    }

    profiles {
        TEXT id PK "É users(id) — não há coluna user_id"
        TEXT profile_data "JSON: o perfil do locador"
        TEXT updated_at "ISO-8601"
    }

    contracts {
        TEXT id PK "gerado no cliente"
        TEXT user_id FK "users(id) ON DELETE CASCADE"
        TEXT name "nome do contrato"
        TEXT template_id "locacao_residencial | comercial | simples"
        TEXT fields "JSON: partes, valores, prazo, assinaturas, trilha"
        INTEGER is_finalized "1 = assinado, vira só leitura"
        TEXT cloud_id "id do tenant_links — o vínculo com o link"
        TEXT cloud_key "chave AES do link (em claro: dívida aberta)"
        TEXT created_at "imutável no upsert"
        TEXT updated_at "carimbado pelo servidor"
    }

    properties {
        TEXT id PK "gerado no cliente"
        TEXT user_id FK "users(id) ON DELETE CASCADE"
        TEXT name "identificação do imóvel"
        TEXT address "endereço; cep, type, area e valores em colunas próprias"
        TEXT status "manual; Alugado é DERIVADO de contrato ativo"
        REAL rent_value "aluguel de referência"
    }

    clients {
        TEXT id PK "gerado no cliente"
        TEXT user_id FK "users(id) ON DELETE CASCADE"
        TEXT name "nome"
        TEXT document "CPF/CNPJ — SEM unique; a dedupe é do app"
        TEXT client_type "Inquilino | Locador | Fiador"
        TEXT person_type "PF | PJ"
    }

    financial_records {
        TEXT id PK "gerado no cliente"
        TEXT user_id FK "users(id) ON DELETE CASCADE"
        TEXT contract_id "vínculo lógico — sem FK"
        REAL rent_value "valor do aluguel"
        REAL fee_value "taxa de administração"
        REAL net_payout "repasse ao locador"
        TEXT due_date "dia do contrato, nunca antes do início"
        TEXT status "Pendente | Pago — Atrasado é DERIVADO"
        TEXT paid_at "quando foi marcado como pago"
    }

    inspections {
        TEXT id PK "gerado no cliente"
        TEXT user_id FK "users(id) ON DELETE CASCADE"
        TEXT property_id "vínculo lógico com properties(id)"
        TEXT contract_id "contrato ativo do imóvel, quando há"
        TEXT tipo "Entrada | Saída"
        TEXT status "Rascunho | Fechada"
        TEXT inspected_on "data da vistoria"
        TEXT rooms "JSON: [{nome, estado, obs}]"
        TEXT closed_at "carimbo do fechamento"
    }

    midias {
        TEXT id PK "UUID do servidor"
        TEXT user_id FK "users(id) ON DELETE CASCADE"
        TEXT inspection_id FK "inspections(id) ON DELETE CASCADE"
        INTEGER ambiente "índice POSICIONAL dentro de rooms"
        TEXT tipo "foto | video"
        TEXT mime "image/jpeg, video/webm, …"
        INTEGER bytes "8 MB foto, 25 MB vídeo"
        TEXT arquivo "nome em uploads/ — decidido pelo SERVIDOR"
    }

    tenant_links {
        TEXT id PK "UUID do CSPRNG do cliente"
        TEXT created_by FK "users(id) — NÃO se chama user_id"
        TEXT encrypted_payload "AES-256-GCM, até 512 KB"
        TEXT key_proof "SHA-256 DA PROVA que o cliente manda"
        INTEGER finalized "caminho só de ida"
        TEXT finalized_at "carimbo do servidor, fora do payload"
        TEXT finalized_ip "req.ip — não sai de X-Forwarded-For"
        TEXT expires_at "30 dias; 7 depois de assinado"
    }
```

**Três armadilhas que o diagrama esconde:**

1. **`ambiente` é índice posicional.** Remover um ambiente do meio de `rooms`
   desloca os seguintes — por isso existe `POST /api/midias/reindexar`.
2. **`contracts.fields` é o blob central**, e nele moram assinatura e selfie em
   base64: ~53 KB por contrato, baixados **todos** a cada login. É a dívida de
   escala mais concreta do sistema.
3. **Vínculos lógicos sem FK**: contrato→imóvel (`fields.property_id`),
   `financial_records.contract_id`, e cliente↔contrato por CPF/CNPJ. Apagar um
   imóvel não limpa nada disso.

---

## 4. Pilares de Segurança & Isolamento Multiusuário

```mermaid
graph LR
    subgraph CAMADA_REQUISICAO["1. Entrada da Requisição"]
        HTTP_REQ["Requisição HTTP"] --> COOKIE["Cookie de Sessão (httpOnly, SameSite=Strict)"]
        COOKIE --> SESSAO_CHECK{"Sessão Válida?"}
    end

    subgraph CAMADA_AUTORIZACAO["2. Isolamento de Recursos"]
        SESSAO_CHECK -- "Não" --> RET_401["401 Não Autorizado"]
        SESSAO_CHECK -- "Sim" --> EXTRACT_UID["req.user.id extraído da sessão"]
        EXTRACT_UID --> VERIF_TABELA{"Tabela em RECURSOS?"}
        VERIF_TABELA -- "Não" --> RET_404["404 Não Encontrado"]
        VERIF_TABELA -- "Sim" --> SQL_PARAM["WHERE user_id = req.user.id (Injetado)"]
    end

    subgraph CAMADA_ADMIN["3. Administração"]
        EXTRACT_UID --> ADMIN_CHECK{"is_admin no Banco?"}
        ADMIN_CHECK -- "Não" --> RET_403["403 Proibido"]
        ADMIN_CHECK -- "Sim" --> VIEW_ADMIN["Visualização de Auditoria (Sem cloud_key, Sem ERP)"]
    end
```

---

## 5. Ciclo de Vida: Contrato e Vistoria

Os dois estados que o sistema **deriva** e os que ele **grava** — a distinção
importa: estado derivado nunca envelhece, estado gravado envelhece se ninguém
atualizar.

### 5.1 Contrato

O quadrado de cima é **derivado das datas** a cada render (`Utils.getContractStatus`):
não existe coluna de status no banco, e é por isso que ele nunca mente. O de
baixo é **gravado** (`is_finalized`) e só anda uma vez.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Pendente: contrato criado
    Pendente: Pendente<br/>(falta início ou término)
    Pendente --> AIniciar: datas preenchidas
    AIniciar: A Iniciar<br/>(hoje < início)
    AIniciar --> Ativo: chega a data de início
    Ativo: Ativo<br/>(início ≤ hoje ≤ término)
    Ativo --> Vencido: passa do término
    Vencido: Vencido<br/>(hoje > término)
    Vencido --> Ativo: reajuste/renovação estende o prazo

    note right of Pendente
        Derivado das datas em toda leitura.
        Nenhuma coluna guarda isto.
    end note
```

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Rascunho: is_finalized = 0
    Rascunho --> AguardandoInquilino: link gerado (cloud_id)
    AguardandoInquilino: Aguardando inquilino
    AguardandoInquilino --> Assinado: inquilino envia (finalize)
    Assinado: Assinado<br/>(is_finalized = 1, só leitura)
    Assinado --> [*]

    note right of Assinado
        Caminho só de ida: o link recusa
        reescrita e a tela vira consulta.
    end note
```

### 5.2 Vistoria

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Rascunho: criada (Entrada ou Saída)
    Rascunho: Rascunho<br/>edita ambientes, estado, foto e vídeo
    Rascunho --> Fechada: "Fechar vistoria" (closed_at)
    Fechada: Fechada<br/>tudo em leitura, mídia visível
    Fechada --> Rascunho: "Reabrir"

    note right of Fechada
        Só a vistoria de ENTRADA fechada
        serve de base para a de saída:
        a saída herda os ambientes dela.
    end note
```

**Por que a saída depende do fechamento da entrada:** enquanto a entrada é
rascunho, a lista de ambientes ainda pode mudar. Herdar de uma lista instável
faria os dois lados da comparação divergirem — e a comparação é a razão de a
vistoria existir.
