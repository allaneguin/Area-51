# Volta à Supabase — Auth, Postgres e Storage

**2026-08-28.** Migrar banco, autenticação e arquivos para a Supabase, desfazendo
a saída de 26/08.

---

## 1. A decisão, e o que ela desfaz

**Decisão do dono do projeto, tomada em 28/08 após duas rodadas de contraponto.**
O motivo declarado: *"quero um lugar simples e fácil para o banco de dados, sem
ter que ficar rodando no terminal, como eu fazia no terminal do Supabase"* — ou
seja, o Table Editor / SQL Editor de volta.

Foram oferecidas duas alternativas mais baratas para esse mesmo motivo (extensão
SQLite Viewer no VS Code; DB Browser for SQLite — ambas zero migração, zero
infraestrutura). O dono optou pela Supabase mesmo assim, e pelo escopo completo:
**Auth + Postgres + Storage**.

Isto **desfaz a migração de 26/08**, registrada no `CHANGELOG.md` e no
`docs/ARQUITETURA.md` §0.1. Pela regra de manutenção do próprio ARQUITETURA
("se uma mudança contraria a Parte II, primeiro se muda este documento"), a
seção 0.1 e as regras R1, R2, R4, R5 e R8 serão reescritas **antes** da Fase 3,
não depois.

## 2. O que se ganha

| Ganho | Observação |
|---|---|
| **Painel para ver e editar o banco** | O motivo declarado. Table Editor + SQL Editor no navegador. |
| **Storage de arquivos** | Some a pasta `uploads/`, a varredura de órfão e o backup em duas partes. |
| **E-mail de redefinição de senha** | Volta de graça com o Auth — está aberto desde 26/08. |
| **OTP por SMS/telefone** | Phone Auth resolve o que discutimos ontem, sem provedor separado. |
| **Backup gerenciado** | A Supabase faz backup diário do Postgres (retenção varia com o plano). |
| **Deploy fica mais perto** | Sem estado local, o front pode voltar a ser estático em qualquer host. |

## 3. O que se perde — a parte que não pode ficar implícita

Cada item aqui é uma garantia que **existe hoje e some**, ou vira trabalho novo.

1. **Os 59 testes de escopo viram políticas RLS.** Hoje "a conta B não lê dado da
   conta A" é código nosso com teste executável. Vira SQL declarativo no banco,
   e o teste passa a exigir um Postgres para rodar. A garantia continua
   existindo; o que muda é onde mora e quanto custa verificá-la.
2. **O IP do aceite fica mais frágil.** Hoje o carimbo é `req.ip` no nosso
   servidor, com `trust proxy` desligado — inforjável (corrigido em 28/08). Numa
   arquitetura em que o navegador fala direto com o PostgREST, a RPC só alcança
   o IP por `current_setting('request.headers')` → `x-forwarded-for`, que é
   **exatamente o cabeçalho forjável** que a correção de ontem eliminou. É a
   única parte da trilha de aceite que o signatário não redige, e ela regride.
   **Mitigação obrigatória** (§7).
3. **O limite por conta e por bloco IPv6 some.** A Supabase tem limites próprios
   no Auth, mas não os nossos: 20 falhas/hora por conta, IPv6 agrupado por /64,
   teto de upload por conta. Corrigidos ontem, saem com o `limite.js`.
4. **Os testes deixam de rodar sem infraestrutura.** Hoje: `npm test`, e pronto.
   Depois: um Postgres (Docker, ou um segundo projeto Supabase só para teste).
5. **O `unsafe-inline` fica pior acompanhado.** O SDK da Supabase volta para a
   CSP como script de CDN (ou exige bundler — o "Caminho B" adiado). Em 26/08 a
   CSP ficou mais curta justamente por isso.
6. **Dado pessoal de terceiro sai da sua máquina.** CPF, RG, selfie, assinatura,
   IP e GPS passam a viver em servidor de terceiro. É permitido, mas cria
   transferência a declarar — e o `termos.html` ainda é minuta com
   `[PREENCHER]`. **Região São Paulo é obrigatória** nesta migração.
7. **Volta a dependência de rede para trabalhar.** Sem internet, hoje o sistema
   roda; depois, não.

## 4. Estratégia: três fases, cada uma com o sistema de pé

O salto único de duas semanas deixa o sistema quebrado no meio. Em fases, cada
uma é reversível e entrega valor sozinha.

### Fase 1 — Postgres (≈2 dias)

A Supabase vira "o banco na nuvem com painel". **Nada mais muda:** nosso
servidor, nosso login, nosso `limite.js`, nossos 59 testes.

- `server/db.js` passa a falar com Postgres (`pg`, segunda dependência).
- Dialeto: `insert ... on conflict` continua; some `pragma`; `text` vira
  `timestamptz` onde fizer sentido.
- **A armadilha do jsonb, ao contrário.** Em 26/08 o problema foi o SQLite
  devolver string onde o PostgREST devolvia objeto. Agora inverte: `fields` e
  `rooms` voltam a chegar **parseados**, e o `JSON.parse` da borda tem de sair.
  O teste `fields volta como OBJETO` é o que protege isso — mantê-lo.
- Testes: um `docker compose` com Postgres, ou um projeto Supabase de teste.
- **O motivo declarado da migração já está satisfeito ao fim desta fase.**

### Fase 2 — Storage (≈1 dia)

- Bucket privado por conta; a rota `midias` passa a assinar URLs em vez de
  servir bytes.
- Some `uploads/`, some `varrer()`, some o backup em duas partes.
- Os testes de mídia (10 casos) migram para o bucket de teste.

### Fase 3 — Auth e RLS (≈1 a 2 semanas)

A mais cara, e a que desfaz mais coisa.

- **As contas não migram.** A senha é `scrypt` do `node:crypto`; a Supabase usa
  bcrypt e não importa hash de outro formato. Cada usuário **recria a conta**, e
  o `user_id` muda — então toda linha das 8 tabelas precisa ser reapontada, ou
  os dados recomeçam.
- **As 4 RPCs `SECURITY DEFINER` do link do inquilino voltam a existir.** Elas
  foram apagadas em 26/08 (`supabase/migrations/`). Precisam ser reescritas
  preservando: teto de 512 KB, `key_proof` guardado como SHA-256 da prova,
  `finalized` só de ida, expurgo do expirado na leitura, e o carimbo de
  evidência feito fora do payload.
- **RLS em 8 tabelas**, mais o teste de cada política.
- `api.js` passa a usar `supabase-js`; `sessao.js` e `limite.js` saem.

## 5. Dados existentes — decisão pendente

Diferente de 26/08, **agora há dado com valor jurídico**: o contrato assinado
por Allano Francisco de Olveira em 26/08, com selfie, assinatura, hash do texto
lido e carimbo do servidor. Descartar isso não é o mesmo que descartar protótipo.

Duas opções, e o dono decide antes da Fase 1:

- **Migrar**: exportar as 9 tabelas do `data.db` e importar no Postgres. O
  `user_id` é reapontado na Fase 3, quando a conta for recriada.
- **Recomeçar**: banco limpo. O contrato do Allano precisa ser exportado em PDF
  antes, porque a trilha de aceite não se reconstrói.

## 6. Pré-requisitos (só o dono pode fazer)

1. Criar o projeto na Supabase — **região São Paulo**.
2. Guardar as três credenciais: `SUPABASE_URL`, `anon key`, `service_role key`.
3. **A `service_role` nunca vai para o front, nunca para o repositório.** Ela
   ignora RLS por definição. Vai em `.env`, que entra no `.gitignore` **no mesmo
   commit** em que a variável nascer. Hoje o projeto tem **zero segredos** — essa
   propriedade acaba aqui, e o cuidado passa a ser permanente.
4. Decidir §5 (migrar ou recomeçar).

## 7. Mitigação obrigatória do IP do aceite

Sem isto, a Fase 3 degrada a única evidência que o signatário não redige.

Duas saídas, a escolher quando a Fase 3 começar:

- **Edge Function como porta do aceite** (recomendada): o `finalize` deixa de ser
  RPC direta e passa por uma Edge Function, que enxerga o IP real da conexão e o
  grava. Mantém a propriedade atual.
- **Assumir a regressão, e dizer isso no certificado**: o campo passa a ser
  "IP informado pelo navegador" em vez de "IP registrado pelo servidor". Honesto,
  mas vale menos como prova.

## 8. Critério de parada

Ao fim de cada fase, uma pergunta: *o painel da Supabase já resolveu o que me
levou até aqui?* Se a resposta for sim na Fase 1 ou 2, **parar ali é vitória**,
não desistência — o sistema fica de pé, com o ganho na mão e sem o custo das
fases seguintes.

## 9. O que este documento não cobre

- Como cada política RLS é escrita (vai no plano de implementação da Fase 3).
- Deploy do front, que fica mais fácil depois da Fase 3 e é assunto de outro spec.
- Cobrança da Supabase acima do plano gratuito.
