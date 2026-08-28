# Arquitetura do Sistema — Meus Imóveis (Área-51)

Documento executivo e técnico com os diagramas visuais e mapeamento de componentes da aplicação.

---

## 1. Visão Geral da Arquitetura (Visão em Camadas)

```mermaid
graph TB
    subgraph CLIENTE_LOCADOR["Navegador do Locador (Desktop / Mobile)"]
        UI_L["Shell SPA (app.html + CSS)"]
        VIEWS_L["Views (Dashboard, Contratos, Editor, Imóveis, Clientes, Financeiro, Vistorias)"]
        STORAGE_L["Storage (Cache em Memória + Fire-and-Forget)"]
        API_L["Api (Cliente HTTP Fetch)"]
        CRYPTO_L["CloudDB (WebCrypto AES-256-GCM)"]
    end

    subgraph CLIENTE_INQUILINO["Navegador do Inquilino (Mobile / Público)"]
        UI_T["Tela do Inquilino (#tenant?id=...&key=...)"]
        TENANT_JS["tenant-v2.js (Preenchimento, Selfie, Assinatura)"]
        CRYPTO_T["WebCrypto (Decifra contrato e Cifra resposta)"]
    end

    subgraph SERVIDOR["Backend (Node.js + Express - server/)"]
        direction TB
        STATIC["express.static (public/) + Headers de Segurança"]
        SEC_HEADERS["X-Frame-Options: DENY\nContent-Type-Options: nosniff\nCSP"]
        
        subgraph MIDDLEWARES["Filtros e Segurança"]
            COOKIE_AUTH["Sessão por Cookie httpOnly (scrypt / SHA-256)"]
            EXIGIR_LOGIN["exigirLogin (Isolamento por user_id)"]
            EXIGIR_ADMIN["exigirAdmin (is_admin === true)"]
        end

        subgraph ROTAS["Rotas de API (/api)"]
            R_AUTH["/api/auth (Login, Registro, Senha, Logout)"]
            R_PERFIL["/api/perfil (Perfil do Locador - sem :id)"]
            R_RECURSOS["/api/:recurso (contracts, properties, clients, financial_records, inspections)"]
            R_LINKS["/api/links (Links do Inquilino - Público)"]
            R_ADMIN["/api/admin (Supervisão de Contas - Read-Only)"]
        end

        DB_LAYER["db.js (node:sqlite + Lista Branca RECURSOS + Serialização JSON)"]
    end

    subgraph BANCO_DADOS["Banco de Dados (data.db - SQLite)"]
        T_USERS[("users")]
        T_SESSIONS[("sessions")]
        T_PROFILES[("profiles")]
        T_CONTRACTS[("contracts")]
        T_PROPERTIES[("properties")]
        T_CLIENTS[("clients")]
        T_FINANCIAL[("financial_records")]
        T_INSPECTIONS[("inspections")]
        T_LINKS[("tenant_links")]
    end

    %% Relações Locador
    UI_L --> VIEWS_L
    VIEWS_L --> STORAGE_L
    VIEWS_L --> CRYPTO_L
    STORAGE_L --> API_L
    API_L -->|HTTP Requests + Cookie| SERVIDOR

    %% Relações Inquilino
    UI_T --> TENANT_JS
    TENANT_JS --> CRYPTO_T
    CRYPTO_T -->|HTTP Requests sem Sessão| R_LINKS

    %% Backend interno
    STATIC --> SEC_HEADERS
    SERVIDOR --> MIDDLEWARES
    MIDDLEWARES --> ROTAS
    ROTAS --> DB_LAYER
    DB_LAYER --> BANCO_DADOS
```

---

## 2. Fluxo do Inquilino & Criptografia Ponta a Ponta

Este é o fluxo mais crítico do sistema: o contrato é protegido de modo que o servidor armazena os dados cifrados sem conhecer o conteúdo legível durante o trânsito do link.

```mermaid
sequenceDiagram
    autonumber
    actor Locador as 🧑‍💼 Locador
    participant Editor as 💻 Editor (Browser)
    participant CloudDB as 🔐 CloudDB (WebCrypto)
    participant Servidor as 🖥️ Servidor (/api/links)
    participant Banco as 🗄️ SQLite (data.db)
    actor Inquilino as 📱 Inquilino

    Locador->>Editor: Finaliza minuta e clica em "Gerar link do inquilino"
    Editor->>CloudDB: Gera chave aleatória AES de 16 chars (CSPRNG)
    CloudDB->>CloudDB: Cifra dados do contrato (AES-256-GCM)
    CloudDB->>CloudDB: Gera key_proof = SHA-256(chave)
    CloudDB->>Servidor: POST /api/links { id, encrypted_payload, key_proof }
    Servidor->>Banco: Grava tenant_links (guarda SHA-256(key_proof))
    Servidor-->>Editor: Link criado com sucesso
    Editor-->>Locador: Gera URL: meusite.com/#tenant?id=UUID&key=CHAVE

    Note over Locador,Inquilino: A chave trafega apenas no fragmento da URL (#), nunca em headers HTTP

    Locador->>Inquilino: Envia link via WhatsApp / Mensagem
    Inquilino->>Servidor: GET /api/links/:id (Sem autenticação)
    Servidor->>Banco: Busca payload e confere expiração (30 dias)
    Servidor-->>Inquilino: Retorna encrypted_payload
    Inquilino->>Inquilino: Decifra contrato usando a chave do fragmento (#)
    Inquilino->>Inquilino: Preenche RG, profissão, assina e tira selfie
    Inquilino->>CloudDB: Cifra dados preenchidos com a mesma chave
    Inquilino->>Servidor: PUT /api/links/:id { payload_cifrado, proof }
    Note over Servidor: Servidor valida SHA-256(proof), carimba finalized_at e IP
    Servidor->>Banco: Atualiza tenant_links (finalized = 1, finalized_at, finalized_ip)
    Servidor-->>Inquilino: Confirmação de assinatura

    Locador->>Editor: Abre contrato e clica em "Importar dados do Inquilino"
    Editor->>Servidor: GET /api/links/:id
    Servidor-->>Editor: Retorna payload cifrado + carimbo oficial do servidor
    Editor->>CloudDB: Decifra com a cloud_key salva no contrato
    Editor->>Editor: mesclarCamposDoInquilino (Lista branca estrita: protege locador, valor e conta bancária)
    Editor->>Servidor: Salva contrato mesclado em /api/contracts/:id
```

---

## 3. Modelo de Dados e Relacionamentos (SQLite)

```mermaid
erDiagram
    users ||--o{ sessions : "possui"
    users ||--|| profiles : "possui"
    users ||--o{ contracts : "cria"
    users ||--o{ properties : "gerencia"
    users ||--o{ clients : "cadastra"
    users ||--o{ financial_records : "lança"
    users ||--o{ inspections : "realiza"
    users ||--o{ tenant_links : "gera"
    inspections ||--o{ midias : "documenta"

    users {
        text id PK "UUID do servidor"
        text email UK "E-mail único"
        text senha_hash "scrypt + salt"
        text salt "16 bytes aleatórios"
        integer is_admin "0 ou 1"
        text criado_em "ISO-8601"
        text ultimo_login "ISO-8601"
    }

    sessions {
        text token PK "Token da sessão"
        text user_id FK "users.id"
        text expira_em "ISO-8601 (7 dias)"
        text created_at "ISO-8601"
    }

    profiles {
        text id PK "users.id (sem parâmetro :id na rota)"
        text profile_data "JSON com dados do locador"
        text updated_at "ISO-8601"
    }

    contracts {
        text id PK "UUID gerado no cliente"
        text user_id FK "users.id"
        text name "Título do contrato"
        text template_id "locacao_residencial, etc."
        text fields "JSON: partes, imóvel, valores, assinaturas"
        text cloud_id "ID do tenant_link gerado"
        text cloud_key "Chave AES para decifrar"
        integer is_finalized "0 ou 1"
        text created_at "ISO-8601 imutável"
        text updated_at "ISO-8601"
    }

    properties {
        text id PK "UUID do cliente"
        text user_id FK "users.id"
        text title "Nome/Identificação"
        text address "Endereço completo"
        real rent_value "Valor numérico do aluguel"
        text status "Disponível ou Alugado (derivado)"
    }

    clients {
        text id PK "UUID do cliente"
        text user_id FK "users.id"
        text name "Nome do cliente"
        text document "CPF ou CNPJ"
        text client_type "Locador ou Locatário"
    }

    financial_records {
        text id PK "UUID do cliente"
        text user_id FK "users.id"
        text contract_id "Vínculo lógico com contracts.id"
        real rent_value "Valor do aluguel"
        real fee_value "Taxa de administração"
        real net_payout "Repasse líquido ao locador"
        text due_date "Vencimento: dia do contrato, nunca antes do início"
        text status "Pendente ou Pago (Atrasado é derivado)"
    }

    inspections {
        text id PK "UUID do cliente"
        text user_id FK "users.id"
        text property_id "Vínculo com o imóvel"
        text tipo "Entrada ou Saída"
        text rooms "JSON: [{nome, estado, obs}]"
        text status "Rascunho ou Fechada"
        text closed_at "Carimbo do fechamento"
    }

    midias {
        text id PK "UUID do servidor"
        text user_id FK "users.id"
        text inspection_id FK "inspections.id (cascata)"
        integer ambiente "Índice posicional dentro de rooms"
        text tipo "foto ou video"
        text mime "image/jpeg, video/webm, ..."
        integer bytes "Tamanho do arquivo"
        text arquivo "Nome em uploads/ — decidido pelo SERVIDOR"
    }

    tenant_links {
        text id PK "UUID do cliente"
        text created_by FK "users.id (nome real da coluna)"
        text encrypted_payload "Blob cifrado (AES-GCM <= 512KB)"
        text key_proof "SHA-256(SHA-256(chave))"
        integer finalized "0 ou 1 (só de ida)"
        text finalized_at "Carimbo UTC pelo servidor"
        text finalized_ip "IP capturado pelo servidor"
        text expires_at "Data de expiração (30 dias)"
    }
```

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
