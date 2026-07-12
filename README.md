# QA Reporter

Plataforma web completa de **gestão e documentação de QA** — do planejamento de testes à geração de evidências, passando por integração com Azure DevOps, monitoramento de APIs e colaboração em tempo real entre a equipe.

Construído com **React + TypeScript + Vite** no front e **Supabase** (Postgres + Auth + Realtime + Storage) no back, sem servidor próprio para manter.

### 🔗 Demo ao vivo

**[qas-reporter.netlify.app](https://qas-reporter.netlify.app/#/login)**

| Campo | Valor |
|---|---|
| E-mail | `gui@qa.com` |
| Senha | `Teste@123` |
| Papel | Leitura (viewer) — só navegação, sem risco de alterar os dados de demonstração |

---

## Funcionalidades

### 📄 Relatórios de evidência
- Editor de relatório com preview em tempo real, upload de imagens e formatação rica (negrito, listas etc.)
- Exportação em **PDF** (pixel-perfect, captura o próprio preview) e **DOCX**
- **Colaboração ao vivo**: um relatório pode virar uma sessão compartilhada — dois QAs editando o mesmo documento ao mesmo tempo, com indicador de presença ("quem está online") via Supabase Realtime

### 🧪 Gestão de Testes
- Planos, casos de teste, execuções (*runs*), rastreabilidade requisito ↔ caso
- Gestão de defeitos com **sincronização bidirecional com Azure DevOps** (cria bug, adiciona comentários, acompanha status)
- Sessões exploratórias, dashboard com indicadores e templates dinâmicos de bug por projeto

### 🔌 Módulo de APIs
- Cliente de API estilo Postman: coleções, execução em lote, importação de `.postman_collection`
- **Health Check** de ambientes/serviços com configuração compartilhada entre toda a equipe (não fica presa ao navegador de quem criou)

### 🛠️ Ferramentas de apoio ao QA
- Gerador de massa de dados (CPF/CNPJ, cartão, endereço), validador de nota fiscal, formatador de IDs, conversor OFX↔Base64
- Duas **extensões de navegador** complementares (geração de dados de teste e health-check de APIs direto no browser)

### 🔐 Administração e permissões
- Modelo de papéis (`admin`, `qa`, `viewer`) refletido tanto no front quanto em **Row Level Security no Postgres** — a regra de quem pode criar/editar/excluir vive no banco, não só na UI
- Gestão de usuários, PAT do Azure DevOps por usuário e conexões org/projeto configuráveis por admin

---

## Destaques técnicos

Alguns problemas reais resolvidos durante o desenvolvimento:

- **Export de PDF sem servidor**: o PDF é gerado no client rasterizando o preview HTML (`html2canvas` + `jsPDF`). Imagens de evidência trafegam como *data URL* (não URL pública) especificamente para evitar que o `canvas` seja "contaminado" por CORS ao exportar.
- **Cache de imagens fora do localStorage**: evidências em base64 podem estourar a cota do `localStorage`; o cache fica no **IndexedDB**, com o relatório guardando apenas uma chave — resolve um bug real de "relatório abre com dados antigos".
- **Colaboração em tempo real sem conflito**: edição concorrente é resolvida com controle de revisão (`rev`) + merge seletivo, evitando que o upload assíncrono de uma imagem sobrescreva uma edição de texto feita durante o upload.
- **RLS como fonte de verdade**: funções `SECURITY DEFINER` no Postgres (`qa_is_admin`, `qa_can_write`) centralizam a regra de permissão — a UI e o banco ficam alinhados por design, não por convenção.

---

## Stack

**Front-end:** React 18 · TypeScript · Vite · React Router
**Back-end:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)
**Exportação:** html2canvas, jsPDF, docx, xlsx
**Integrações:** Azure DevOps REST API

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                # http://localhost:5173
```

Aplique as migrations em `supabase/migrations/` no seu projeto Supabase antes do primeiro acesso.

```bash
npm run build      # build de produção → dist/
npm run preview    # serve o build localmente
```

## Estrutura

```
src/
  lib/            supabase, auth, azureDevOps, reportEngine, exporters, apisStorage...
  context/        AuthProvider, ToastProvider, LoadingProvider
  hooks/          useReport (estado + autosave + modo sessão), useTheme
  components/     Sidebar, DocumentPreview, CriterionCard, StepItem, ImageDropzone
  pages/
    tests/        Casos, Planos, Runs, Defeitos, Exploratório, Dashboard, Azure
    apis/         Health Check, Runner, Bulk Import, Config
    tools/        Gerador de dados, validadores, conversores
supabase/migrations/   schema completo do banco (RLS incluída)
browser-extension/         extensão Chrome — gerador de dados de teste
browser-extension-apis/    extensão Chrome — health check de APIs
```

## Segurança

Ver [`SECURITY.md`](./SECURITY.md) para detalhes do modelo de autenticação e recomendações de hardening antes de uso com dados sensíveis.
