# Notas de Segurança — QA Reporter

> Este documento registra os **riscos conhecidos** herdados do sistema original.
> Por decisão de projeto, a autenticação foi portada **1:1** (sem alterar o comportamento).
> Nada aqui é um bug introduzido na migração — são características do sistema legado que
> precisam ser endereçadas antes de um uso em produção com dados sensíveis.

## Riscos atuais

### 1. Autenticação mock no cliente (crítico)
- As senhas são verificadas com um **hash trivial não criptográfico** (`mockHash`, DJB2)
  rodando no navegador — ver `src/lib/auth.ts`.
- O "banco de usuários" vive em `localStorage` (`qa_users_db`) e é sincronizado com a tabela
  `qa_users` do Supabase, onde o hash fica em texto recuperável.
- Qualquer pessoa com acesso ao navegador/DevTools consegue ler/forjar a sessão
  (`sessionStorage.qa_auth = '1'`).
- Usuários semente (`admin/admin`, `qa/qa`, `leitura/leitura`) são criados automaticamente.

### 2. Chave do Supabase no bundle
- A `VITE_SUPABASE_ANON_KEY` é embutida no JavaScript publicado (inevitável em apps estáticos).
  Isso é aceitável **apenas** se a segurança real estiver nas políticas RLS — o que não é o caso hoje.

### 3. RLS totalmente aberta para `anon` (crítico)
- As migrations (`supabase/migrations/*.sql`) concedem `select/insert/update/delete` a
  `anon, authenticated` com `using (true)` em **todas** as tabelas
  (`qa_users`, `qa_templates`, `qa_template_images`, `qa_report_data_entries`).
- Na prática, qualquer um com a URL + anon key pode ler e alterar todos os dados.

### 4. RBAC apenas no front-end
- Os perfis `admin/qa/leitura` são aplicados só na UI (esconder botões, desabilitar campos).
  Não há nenhuma checagem no servidor — as regras são contornáveis via chamadas diretas à API.

## Plano de hardening recomendado (trabalho futuro)

1. **Migrar para Supabase Auth real** (email/senha ou SSO):
   - Senhas hasheadas no servidor (bcrypt/scrypt) — remover `mockHash`.
   - Sessão via JWT do Supabase em vez de `sessionStorage.qa_auth`.
2. **Reescrever as políticas RLS** por usuário/role:
   - `qa_templates`/`qa_template_images`: dono pode editar/excluir; demais só leitura.
   - `qa_users`: somente `admin` (via claim de role) pode escrever.
   - Restringir `anon` (idealmente exigir `authenticated`).
3. **Mover o RBAC para o banco** (claims/policies) e manter a UI apenas como conveniência.
4. **Rotacionar a chave** e revisar se a publishable em uso tem o mínimo de privilégios.

Enquanto o item 1 e 2 não forem feitos, trate este app como **interno/confiável** e
não exponha dados sensíveis nele.
