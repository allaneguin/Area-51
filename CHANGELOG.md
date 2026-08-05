# Changelog — Meus Imóveis

Registro de todas as alterações do sistema, para o time ter uma referência única do que já foi feito e por quê — não importa se a mudança foi feita manualmente ou com apoio de IA, todo pedido de alteração entra aqui.

**Convenção para quem for atualizar este arquivo:**
- Mais recente primeiro.
- Uma seção por dia (`## AAAA-MM-DD`).
- Cada linha cita o hash do commit entre parênteses — quem quiser o detalhe roda `git show <hash>`.
- Uma ou duas linhas por mudança bastam: o quê, e o porquê quando não for óbvio. Não precisa ser extenso.

> Anterior a 20/07: reconstruído a partir do `git log`, sem o contexto das conversas que geraram cada commit — resumos fiéis às mensagens originais.

---

## 2026-08-05

Rodada P0 da arquitetura (assets do app: 1.26.0 → **1.26.1**):

- **SQL congelados e README corrigido**: aviso de NÃO EXECUTAR no topo dos 7 `supabase_*.sql` (só `supabase_verificacao.sql`, somente leitura, continua executável) — reexecutar `schema`/`rls`/`finalize` regredia a segurança de `tenant_links`, e o README ainda mandava rodar `supabase_rls.sql`. De quebra, corrigidos no README o "DDL não versionado" (está versionado desde 21/07) e os "90 dias" de link.
- **Headers de segurança na Vercel** (`vercel.json`): `X-Frame-Options: DENY` (o `frame-ancestors` via `<meta>` é ignorado pelos navegadores — o app estava enquadrável em iframe), `nosniff`, `Referrer-Policy` e HSTS. `Permissions-Policy` ficou de fora de propósito: o fluxo do inquilino usa câmera e GPS.
- **Fim da perda silenciosa de dados**: falha ao salvar/excluir imóvel, cliente, lançamento ou perfil agora avisa com toast — antes só ia para o console e o dado sumia no reload. Rota única de erro (`Storage._cloudWrite`), incluindo o `.catch` de rede que essas escritas nem tinham.
- **Vazamento de cache na troca de conta**: `Storage.clearAll()` zera os 5 caches (antes zerava só contratos e perfil — imóveis/clientes/financeiro de A podiam renderizar para B se a recarga falhasse). Com teste em `properties.test.js`.
- **`termos.html` dizia 90 dias de expiração do link; o banco pratica 30** desde o endurecimento de 30/07. Documento jurídico realinhado ao sistema.

- **Arquitetura de referência**: criado `docs/ARQUITETURA.md` — mapa fiel do sistema como é (módulos, estado, dados, segurança, CSS, deploy), regras normativas daqui pra frente (camadas, banco por migrations, invioláveis de segurança, tokens, versionamento, testes), backlog de dívidas priorizado (P0 a P3) e checklist de processo para toda mudança. Motivo: o sistema em produção vinha crescendo por mudanças ad-hoc; agora há uma linha única — mudança que contraria o documento, ou muda o documento primeiro, ou não entra. Achados críticos registrados lá: rodar `supabase_rls.sql` hoje REABRE furos de segurança (o README ainda manda rodar), Vercel sem headers HTTP (clickjacking possível), escrita silenciosamente perdível em 4 das 5 entidades, e `termos.html` prometendo retenção de 90 dias quando o banco pratica 30.

## 2026-07-30

- **Este changelog**: criado para o time ter uma referência única de tudo que já foi feito no sistema, atualizado a cada rodada de mudanças daqui em diante — de qualquer pessoa do time.
- **Contrato não virava "Ativo" sozinho** (`b5a1e78`): a data de término só era calculada quando alguém mexia manualmente num campo do editor; contrato salvo sem esse gatilho ficava "Pendente" para sempre mesmo com prazo válido — e por tabela, o imóvel vinculado nunca virava "Alugado" sozinho. Corrigido na função compartilhada de status, não em cada tela que a usa.
- **Endurecimento de segurança** (`a4058f4` … `b5a1e78`): auditoria encontrou a tabela de links do inquilino listável e gravável por qualquer um com a chave pública do projeto — sem precisar da chave de criptografia do link em si — e pontos de XSS armazenado onde um inquilino mal-intencionado podia rodar código dentro da sessão do locador. Corrigido: acesso anônimo direto à tabela fechado (só as 3 funções que já filtram por id continuam liberadas); teto de 512 KB por link; retenção 90 → 30 dias com expurgo automático; sanitização do payload do inquilino na entrada e nos pontos de exibição; aviso de coleta de IP/GPS antes do envio. No caminho, achado e corrigido um bug que travava o envio do inquilino em produção (`596ca9d`: coluna `text` sendo tratada como `uuid`). Testado direto contra produção (com a chave pública, antes e depois) — furos fechados, fluxo do inquilino intacto. Design e plano documentados em `docs/superpowers/specs/` e `docs/superpowers/plans/`.
- **Vínculo imóvel-contrato** (`d89c155`): "Importar Imóvel" grava o vínculo no contrato; status do imóvel (Alugado/Disponível) passa a ser automático; card do imóvel mostra inquilino atual, total de contratos e receita recebida.
- **Correções de UX** (`7bfe8ee`): assinatura manuscrita centralizada sobre a linha; CEP no cadastro de imóvel via ViaCEP; "Importar Imóvel" não preenchia os dados do contrato (bug na conversão do valor do aluguel).

## 2026-07-29

- **Cadastro automático do inquilino em Clientes** (`8c6e7f8`): contrato salvo com inquilino não cadastrado cria o cliente automaticamente (idempotente por CPF/CNPJ).
- **Assinatura do locador** (`c8878fe`): locador também assina o contrato, com pad manuscrito no editor.
- **Correções** (`4714010`): CEP antes do endereço nos modelos; flash da interface do locador no link do inquilino; bug de tipo (text vs uuid) que travava o envio do inquilino em produção.

## 2026-07-24

- Campo de busca do painel de admin alinhado à coluna central (`1c2aa27`).

## 2026-07-23

- **Módulos de Imóveis, Clientes e Financeiro** (`577ad9a`): novos módulos de ERP, com padronização visual em relação ao resto do sistema.
- Fundo do modal cobre a tela inteira (`b0da7ef`).

## 2026-07-22

Dia mais intenso do projeto até aqui:

- Painel de administrador com visão de todas as contas (`22fa2e5`) → vira ficha de suporte completa por conta (`1bac142`) → divulgação progressiva para reduzir a densidade de informação (`1c68fe9`).
- Flash da interface do locador no link do inquilino + troca de emojis por ícones (`7a2220d`).
- Locador passa a escolher quais métodos de validação exigir do inquilino: assinatura e/ou selfie (`476bc17`).
- Consulta ViaCEP, tratamento de erros no storage, formatação do certificado no PDF (`bfcb1e5`).
- Redesign "Planta Baixa e Mesa de Controle" com nova topbar (`b315dfd` — Allan); remoção de módulos legados e refatoração geral (`f0890fc` — Allan); resolução de conflitos de merge (`1e2fddb`, `e5ea7c3` — Allan); correções de atributo `hidden` no CSS e metadados do perfil (`df35024` — Allan).
- Dois redeploys forçados no Vercel (`5f47dcd`, `962c7eb`).

## 2026-07-21

- Modelo comercial completo: garantias locatícias (caução/fiador), assinatura digital manuscrita, schema Supabase (`1ef29e5`).
- Trilha de auditoria: IP, GPS e hash SHA-256 do aceite + validação por selfie (`cb3c688`).
- CSP liberando os domínios de IP/CEP; captura de IP/GPS mais confiável (`cb2b840`).
- Data de início do contrato exibida no painel e na lista de clientes (`9cd2b7c`).
- Modal de compartilhamento para celular + melhorias de segurança (`0d74def`).
- Correção de estouro de pilha ao cifrar payloads grandes com selfie, com otimização de imagem (`d544362`).
- LGPD: termos de uso e melhorias de segurança (`1f41443` — Allan).

## 2026-07-20

- Remoção da UI antiga; migração para RPCs do Supabase com escape de XSS (`982be7c` — Allan).
- README completo + LICENSE (`03d3717` — Allan); três atualizações de logotipo para SVG (`b91258e`, `92d85ac`, `5e1637c` — Allan).
- Modo escuro / dark mode (`d301165` — Allan).
- Trava pós-aceite (link do inquilino vira somente leitura após o envio), prazos personalizados, correção de timezone, URL curta no Vercel (`63a9414`).

## 2026-06-30 a 2026-07-17

- Landing page como página inicial; app movido para `app.html` (`c31abd4`, `32e6ab1` — Allan) — 30/06.
- Correção do botão "Sair da Conta" ficando ativo indevidamente no dashboard (`d839486` — Allan) — 03/07.
- Modo offline-first, métricas de contratos no dashboard, primeiros testes automatizados (`2975efd` — Allan); limpeza de código morto e versão de assets v1.1.2 (`48caa21` — Allan) — 13/07.
- Refatoração da experiência do inquilino, sistema de toast, otimização da exportação de PDF (`7d8b9d0` — Allan) — 15/07.
- Suporte a locador Pessoa Jurídica, fluxo de recuperação de senha (`afa81e2` — Allan) — 16/07.
- **Migração para Supabase**: autenticação, banco de dados, editor e tenant v2 refeitos (`c7579fd` — Allan); IDs criptográficos e rótulo CPF/CNPJ dinâmico conforme tipo de locador (`980e949` — Allan); política de senha nos formulários (`97e9c8a` — Allan); SQL de RLS do Supabase (`7a91848`) — 17/07.

## 2026-06-23

Dia de migração de infraestrutura, com idas e vindas:

- Links seguros para inquilinos com criptografia AES-GCM (`d82a560`).
- Tentativa de migração para Firebase Firestore com painel de login (`7b06512`) — **revertida no mesmo dia** em favor do Supabase (`a2aa946`).
- Status visual dos contratos e valor por extenso (`f97f6fa`).
- Correções no cadastro: confirmação de e-mail pendente, tradução de erros, rate limit (`3cd4d11`, `5481dd3`, `7bc1833`).

## 2026-05-21 a 2026-05-29 — Início do projeto

- Commit inicial do repositório (`ff215d6` — Allan) e gerador de contratos com suporte a tenant admin (`6bdcd00`).
- Sessão longa de ajustes de PDF (dezenas de commits no mesmo dia, comprimidos aqui): da geração via `html2pdf` — com sucessivos problemas de corte de página, tela branca e cache do navegador — até a migração definitiva para `window.print` nativo (`cbbdaf7` — Allan), que resolveu qualidade e cortes de uma vez. Blow-by-blow completo em `git log` no intervalo `a6b007e..986a96c`.
- Migração do banco de contratos para XML via `DOMParser` (`a6b007e`).
- UX mobile: bottom navigation, bottom sheet do contrato, correções de FAB e menu hambúrguer (`0d7881a`, `1389084`, `b450cd4`, `1f51cf8`, `8fd59d7` — Allan).
- Tema claro institucional, tipografia padronizada (fonte Outfit), README inicial (`9cd6c5d`, `fd51942`, `38ce741`, `8021078` — Allan).
- Nova aba de gestão de contratos por categoria (`f92898e` — Allan).
- Acessibilidade: aria-labels e remoção de estilos inline (`d7a03d7` — Allan), cache-busting nas importações de CSS/JS (`f966892` — Allan) — 22/05.
- Exclusão de um `.docx` de contrato real que tinha ido parar no repositório por engano (`81276a3`) — 29/05.
