# Banco de dados

Tudo que é **executável** no banco vive aqui. Os `supabase_*.sql` na raiz do
repositório estão **congelados** — são registro histórico e alguns deles
*regridem a segurança* se executados. Não os rode.

## As regras

1. **`migrations/` é a verdade.** O banco é a soma das migrations, na ordem.
2. **Migration aplicada nunca é editada.** Corrigiu-se algo? Migration nova.
3. **Um arquivo por mudança**, numerado: `002_descricao_curta.sql`.
4. **Idempotente sempre** (`if not exists`, `drop policy if exists`): rodar
   duas vezes não pode quebrar nada.
5. **Depois de aplicar, rode `verificacao.sql`** e confira que passa inteiro.

## Os arquivos

| Arquivo | O que é | Rodar quando |
|---|---|---|
| `migrations/001_baseline.sql` | Retrato do banco de produção em 2026-08-05 | Só ao provisionar um projeto novo |
| `verificacao.sql` | 19 checagens de segurança, **somente leitura** | Depois de cada migration, e sempre que houver dúvida sobre produção |

## Como aplicar uma migration

Não há CLI configurada: copie o conteúdo do arquivo e execute no **SQL Editor**
do painel do Supabase. Depois rode `verificacao.sql` e confirme que passou.

Se um dia o volume justificar, a CLI do Supabase (`supabase db push`) lê
exatamente esta pasta — o formato já está compatível.

## O que NÃO entra em migration

Dado e configuração de painel, porque não são estrutura:

- **Conceder papel de admin** (`raw_app_meta_data`) — o comando está comentado
  no fim do `001_baseline.sql`. Versionar o e-mail daria admin a quem tivesse
  aquele endereço num projeto novo.
- **Rate limits de Auth e "Confirm email"** — só existem no painel.

Contexto e decisões: `docs/ARQUITETURA.md` (§8 e regra R4).
