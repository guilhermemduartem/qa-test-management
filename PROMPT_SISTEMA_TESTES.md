# Prompt — Adicionar "Gestão de Testes" ao Painel QA Reporter

> Cole este prompt para uma IA de codificação (Claude Code / Cursor / etc.) **com o projeto aberto**.
> Ele descreve exatamente o que construir, como respeitar o projeto existente e o que **NUNCA** tocar.

---

## CONTEXTO DO PROJETO (leia antes de tudo)

Você vai trabalhar no projeto **"Painel QA Reporter"**, que já existe e está em produção. Stack atual (NÃO troque):

- **Vite + React 18 + TypeScript**
- **react-router-dom com `HashRouter`** (rotas no formato `#/caminho`)
- **Supabase** (`@supabase/supabase-js`) — única persistência
- **CSS puro** com design system de variáveis em `src/styles/styles.css` (tema claro/escuro já pronto). **NÃO** introduza Tailwind, shadcn, styled-components, Material UI ou qualquer outro framework de estilo.
- Bibliotecas já presentes: `jspdf`, `html2canvas`, `docx`, `xlsx`.

Convenções do projeto que você DEVE seguir:

- Tabelas Supabase usam prefixo **`qa_`**, PK `text`, `timestamptz` para datas, `jsonb` para estruturas aninhadas. Migrations em `supabase/migrations/` com nome `YYYYMMDDHHMMSS_descricao.sql`.
- Papéis existentes (RBAC): **`admin`**, **`qa`**, **`leitura`**. Reaproveite-os:
  - `admin` = administrador (tudo)
  - `qa` = tester (cria/edita/executa)
  - `leitura` = viewer (somente leitura)
- Helpers de permissão em `src/lib/auth.ts` (`can(...)`, `currentUser()`). Use-os, não crie um sistema de auth paralelo.
- Navegação na `src/components/Sidebar.tsx` (grupos colapsáveis). Rotas registradas em `src/main.tsx`.
- Use as **variáveis CSS já existentes** (`--bg-card`, `--accent`, `--success`, `--error`, `--warning`, `--radius-md`, `--text-secondary`, etc.) para que o novo módulo seja visualmente idêntico ao resto e respeite claro/escuro automaticamente.

---

## 🚨 ZONA INTOCÁVEL — O RELATÓRIO (CRÍTICO)

O motor de relatórios é a parte **mais sensível** do sistema. O PDF é gerado **capturando o DOM do preview** com `html2canvas` — qualquer alteração de HTML/CSS quebra o documento exportado.

**NÃO altere, refatore, "limpe" nem mova** os seguintes arquivos/IDs:

- `src/lib/reportEngine.ts` (`buildDocumentHTML`)
- `src/components/DocumentPreview.tsx`
- `src/lib/exporters.ts` (`exportPDF`, export DOCX)
- `src/lib/reportData.ts`
- `src/pages/ReportPage.tsx` e `src/pages/ReportDataPage.tsx`
- Qualquer CSS associado aos IDs `#preview-scroll`, `#document-wrapper`, `#document-preview` em `styles.css`.

Regras:
1. O novo módulo de Gestão de Testes é **100% aditivo e isolado**. Não importe nada do report engine para alterá-lo.
2. Se precisar reusar lógica (ex: export PDF de um plano de testes), **crie funções novas** — não modifique as existentes.
3. Não renomeie tabelas, colunas ou IDs existentes.
4. Ao final, confirme que `npm run build` passa e que a página de Relatórios e a exportação de PDF/DOCX continuam **idênticas** (gere um PDF antes e depois e compare). Se algo no relatório mudar, reverta.

---

## OBJETIVO

Adicionar ao painel um **módulo de Gestão e Documentação de Testes** — padrão de mercado (estilo TestRail/Qase/Testmo), com visual moderno e limpo (estilo Linear/Notion) usando o design system atual. O módulo permite **criar, gerenciar, consultar e executar** testes de forma centralizada.

Tipos de teste suportados: **manuais, automatizados, de API e exploratórios**.

---

## FASE 1 — CORE (implementar agora)

### 1. Modelo de dados (novas tabelas Supabase, prefixo `qa_test_`)

Crie migrations novas em `supabase/migrations/`. Sugestão de tabelas (ajuste nomes mantendo o prefixo e o padrão do projeto):

- **`qa_test_projects`** — projetos. (`id`, `name`, `description`, `created_by`, `created_at`)
- **`qa_test_suites`** — suítes/pastas dentro de um projeto, com hierarquia. (`id`, `project_id`, `parent_id` nullable, `name`, `order`, `created_at`)
- **`qa_test_cases`** — casos de teste. (`id`, `suite_id`, `project_id`, `title`, `type` enum `manual|automated|api|exploratory`, `priority` enum `low|medium|high|critical`, `status` enum `draft|active|deprecated`, `preconditions` text, `steps` jsonb `[{action, expected}]`, `expected_result` text, `tags` text[], `custom_fields` jsonb, `created_by`, `created_at`, `updated_at`)
- **`qa_test_case_versions`** — histórico de versões de um caso (snapshot jsonb). (`id`, `case_id`, `snapshot` jsonb, `saved_by`, `saved_at`)
- **`qa_milestones`** — marcos (ex: Release 2.0). (`id`, `project_id`, `name`, `due_date`, `status`, `created_at`)
- **`qa_test_plans`** — planos que agrupam runs por release/sprint. (`id`, `project_id`, `milestone_id` nullable, `name`, `scope` text, `created_by`, `created_at`)
- **`qa_test_runs`** — execuções. (`id`, `project_id`, `plan_id` nullable, `name`, `status` enum `open|in_progress|closed`, `assigned_to` nullable, `created_at`, `closed_at`)
- **`qa_test_run_results`** — resultado de cada caso dentro de um run. (`id`, `run_id`, `case_id`, `status` enum `untested|passed|failed|blocked|skipped|retest`, `executed_by`, `executed_at`, `elapsed_seconds`, `comment` text, `evidence` jsonb `[{name,url}]`)
- **`qa_requirements`** — requisitos/histórias para rastreabilidade. (`id`, `project_id`, `external_key` text — ex: chave Jira, `title`, `description`, `created_at`)
- **`qa_test_case_requirements`** — N:N caso ↔ requisito (matriz de rastreabilidade). (`case_id`, `requirement_id`)
- **`qa_defects`** — defeitos vinculados a uma falha. (`id`, `project_id`, `run_result_id` nullable, `title`, `description`, `severity`, `status`, `external_key` text nullable — futura ligação Jira, `created_by`, `created_at`)
- **`qa_exploratory_sessions`** — sessões exploratórias. (`id`, `project_id`, `charter` text, `notes` jsonb timeline, `duration_seconds`, `created_by`, `created_at`)

> **Segurança das tabelas novas (importante):** NÃO repita o RLS aberto (`using(true)` para `anon`) das tabelas legadas. Para as tabelas novas, habilite RLS e escreva políticas por papel: leitura para `authenticated`; escrita restrita conforme o papel (admin total; qa cria/edita/executa; leitura só `select`). Documente num comentário no topo da migration o motivo. Se a migração de auth real ainda não existir, deixe as políticas escritas e um TODO claro; não exponha as tabelas novas a `anon`.

### 2. Camada de acesso a dados

- Crie `src/lib/testManagement.ts` (ou uma pasta `src/lib/tests/`) com funções CRUD tipadas para cada entidade, usando `getSupabaseClient()` de `src/lib/supabase.ts`.
- Adicione os tipos em um novo arquivo `src/types/tests.ts` (NÃO polua o `src/types.ts` existente do relatório). Reexporte se necessário.

### 3. Telas (rotas novas, registradas em `main.tsx` sob `RequireAuth`)

Adicione um novo grupo **"Testes"** na `Sidebar.tsx` (seguindo o padrão dos grupos existentes), com:

- `#/testes` — **Dashboard**: cartões com total de casos, taxa de aprovação do último run, execuções recentes, gráficos simples (use SVG/CSS ou uma lib leve via `import()` dinâmico — não infle o bundle inicial).
- `#/testes/casos` — **Casos de teste**: árvore Projetos → Suítes à esquerda, lista/tabela à direita com busca global, filtros por tag/status/prioridade/tipo. CRUD completo com editor de passos (ação + resultado esperado), prioridade, tags, anexos, campos customizados. Histórico de versões.
- `#/testes/runs` — **Execuções**: criar run a partir de uma seleção de casos/suíte, executar com marcação rápida `passed/failed/blocked/skipped`, cronômetro, evidências (upload de print/anexo) e comentário. Vincular defeito ao falhar.
- `#/testes/planos` — **Planos & Milestones**: agrupar runs, escopo, progresso por marco.
- `#/testes/rastreabilidade` — **Matriz de rastreabilidade**: requisito ↔ casos, destacando requisitos sem cobertura.
- `#/testes/exploratorio` — **Sessões exploratórias**: charter, timeline de anotações, timer.
- `#/testes/relatorios` — **Relatórios/Analytics**: dashboard geral, cobertura de requisitos, histórico de pass/fail por release, produtividade por usuário.

Requisitos de UI:
- Reutilize componentes existentes quando fizer sentido (`Modal`, toasts via `ToastProvider`, loading via `LoadingProvider`).
- Tudo em **Português (PT-BR)**, com suporte a **tema claro/escuro** herdado do design system.
- Layout limpo, denso o suficiente para produtividade, mas com respiro (estilo Linear/Notion). Use as variáveis CSS existentes; se criar CSS novo, adicione numa seção claramente marcada (ex: `/* ─── MÓDULO DE TESTES ─── */`) no fim de `styles.css` ou, preferível, em arquivos CSS separados importados pelas páginas novas, sem tocar nas regras do relatório.
- Respeite o RBAC: `leitura` não vê botões de escrita (use `can(...)`).

### 4. Permissões

Estenda o RBAC de forma aditiva. As novas ações (criar caso, executar run, fechar run, gerenciar projeto) devem checar `can(...)`. Não altere o comportamento dos papéis no módulo de relatórios.

---

## FASE 2 — INTEGRAÇÕES (NÃO implementar agora, apenas deixar preparado)

Deixe o código estruturado para, depois:

- **Jira**: campo `external_key` já previsto em `qa_requirements` e `qa_defects`. A integração real (buscar issues, criar bug) deve ser feita via **Supabase Edge Function** (proxy) — **nunca** chamando a API do Jira direto do front (CORS + exposição de token). Apenas deixe os pontos de extensão e um TODO; não implemente agora.
- **Ingestão de resultados de CI/automação (JUnit XML)**: prever um formato de import e um ponto de entrada (Edge Function ou import manual de arquivo XML reusando a infra de upload). Deixe stub/TODO.

---

## GUARDRAILS / CRITÉRIOS DE ACEITE

1. **O módulo de relatórios continua 100% intacto** — mesmo HTML/CSS/PDF/DOCX. (Verifique gerando um PDF antes e depois.)
2. `npm run build` (`tsc --noEmit && vite build`) passa **sem erros** de tipo.
3. Todo o código novo é **aditivo e isolado**; nenhum arquivo da zona intocável foi modificado.
4. As tabelas novas **não** usam RLS aberto para `anon`.
5. As telas novas respeitam tema claro/escuro e RBAC.
6. Sem novas dependências pesadas no bundle inicial (use `import()` dinâmico para libs de gráfico/exportação).
7. Trabalhe de forma incremental: comece pelo modelo de dados + camada de acesso, depois Dashboard e Casos de teste, depois Execuções, e por fim os demais. Rode o build entre etapas.

Ao terminar, gere um resumo do que foi criado, quais migrations aplicar no Supabase, e um checklist de verificação do relatório.