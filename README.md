# Painel QA Reporter — React (produção)

Gerador de evidências de QA migrado de site estático (JS vanilla) para **React + Vite + TypeScript**,
mantendo o backend **Supabase** e o motor de relatórios (preview + export PDF/DOCX) idêntico ao original.

## Stack

- **Vite** + **React 18** + **TypeScript**
- **react-router-dom** (HashRouter — funciona em qualquer host estático, sem config de servidor)
- **@supabase/supabase-js** — persistência (usuários, templates, imagens, passos)
- **html2canvas** + **jspdf** — export PDF (captura do preview)
- **docx** — export DOCX
- **xlsx** — importação em massa de "Passo a Passo"

## Pré-requisitos

- Node.js 18+ (testado com 22) e npm.
- Um projeto Supabase com as tabelas das migrations aplicadas (ver `supabase/migrations/`).

## Configuração

1. Copie `.env.example` para `.env` e preencha:

   ```env
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
   ```

   > Use **apenas** a chave publishable/anon — nunca a `service_role`.

2. (Se ainda não criou as tabelas) aplique as migrations em `supabase/migrations/` no seu projeto Supabase
   (via Supabase CLI `supabase db push` ou colando o SQL no editor).

## Rodando

```bash
npm install      # instala dependências
npm run dev      # ambiente de desenvolvimento (http://localhost:5173)
npm run build    # build de produção (tsc --noEmit + vite build) → dist/
npm run preview  # serve o build de produção localmente
```

### Login padrão (seed)

Na primeira execução são criados: `admin/admin`, `qa/qa`, `leitura/leitura`.
**Troque/remova estes usuários antes de produção.**

## Deploy

O build gera arquivos estáticos em `dist/`. Publique em qualquer host estático
(Netlify, Vercel, S3, Nginx, etc.). Como usamos **HashRouter**, não é necessário
configurar fallback de SPA — rotas como `#/admin` funcionam direto.

> Lembre-se de definir as variáveis `VITE_*` no ambiente de build do host
> (elas são embutidas no bundle no momento do `vite build`).

## Estrutura

```
src/
  lib/            supabase, auth, storage, reportEngine, exporters, reportData, utils, toast, loading
  context/        AuthProvider, ToastProvider, LoadingProvider
  hooks/          useReport (estado + autosave), useTheme
  components/     Sidebar, Modal, DocumentPreview, CriterionCard, StepItem, ImageDropzone
  pages/          LoginPage, ReportPage, AdminPage, ReportDataPage
  styles/         styles.css (portado 1:1 do original + estilos do login)
supabase/migrations/   schema do banco (inalterado)
```

## ⚠️ Relatórios (parte sensível)

- `src/lib/reportEngine.ts` (`buildDocumentHTML`) gera o **HTML do documento**.
- `src/components/DocumentPreview.tsx` injeta esse HTML mantendo os ids
  `#preview-scroll` / `#document-wrapper` / `#document-preview`.
- `src/lib/exporters.ts` (`exportPDF`) **captura esse DOM** com html2canvas → o PDF é a imagem do preview.

Qualquer mudança no HTML/CSS do preview altera o PDF. Ao mexer aqui, **gere um PDF antes e depois e compare**.

## Notas

- Segurança: ver [`SECURITY.md`](./SECURITY.md). A autenticação foi portada 1:1 do original e
  **não é segura** para dados sensíveis sem o hardening descrito lá.
- O bundle principal é grande (~1,5 MB) por embutir docx/xlsx/html2canvas/jspdf. Funciona normalmente;
  se quiser reduzir o carregamento inicial, dá para fazer `import()` dinâmico dessas libs nos exporters
  e na importação XLSX (otimização opcional, não altera comportamento).
