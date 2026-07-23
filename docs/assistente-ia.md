# Assistente de IA (Gestão de Testes → Assistente IA)

Chat em linguagem natural sobre o **projeto de testes ativo**. O QA pergunta em
português e recebe respostas baseadas nos **dados reais** do projeto — casos,
planos, execuções, defeitos, melhorias e sessões exploratórias. É **somente
leitura**: não cria, altera nem exclui nada.

Exemplos do que responde:

- "Quantos bugs críticos estão abertos?"
- "Quais casos nunca foram executados?"
- "Qual foi a taxa de aprovação da última execução?"
- "Já existe algum caso testando cupom expirado?"
- "Me resume os passos do caso `mq71dsmq0zad2`."
- "O que cobre o card 14887 do Azure?"

---

## Como funciona (arquitetura)

```
Navegador (AssistentePage)
   │  fetch SSE (JWT do usuário)
   ▼
Supabase Edge Function  qa-chat   ← a chave da API vive aqui (nunca no browser)
   │                    │
   │ 1) monta índice    │ 2) chama o modelo (Google Gemini) com o índice + ferramentas
   ▼                    ▼
Postgres (RLS do usuário)     Gemini (streaming + function calling)
   ▲                    │
   └──── ferramentas ◄──┘  (detalhe sob demanda: passos, descrição, resultado a resultado…)
```

1. **Índice compacto no contexto.** A função monta um "mapa" do projeto —
   suítes, casos (id, título, tipo, prioridade, status, tags), planos,
   execuções (já agregadas), defeitos e sessões — em texto **delimitado por
   `|`** (não JSON, que custaria ~40–50% mais tokens). Só o essencial entra; o
   volume (passos, descrições, resultado a resultado) fica **de fora** e é
   buscado sob demanda.
2. **Agregações no Postgres, nunca no modelo.** Taxas e contagens de execução
   vêm de funções SQL (`qa_chat_run_stats`, `qa_chat_case_coverage`,
   `qa_chat_defect_counts`). A tabela crua `qa_test_run_results` (uma linha por
   caso × execução × ciclo) **nunca** entra no contexto.
3. **Ferramentas (function calling).** Quando a pergunta exige detalhe, o modelo
   chama uma das 5 ferramentas, que consultam o banco e devolvem texto:
   - `get_case_details` — pré-condições, passos e resultado esperado de casos.
   - `search_cases` — busca textual em título/pré-condições/resultado/passos.
   - `get_defect_details` — descrição completa de defeitos/melhorias.
   - `get_run_details` — resultado caso a caso de uma execução (filtra por status).
   - `get_traceability` — cadeia card → planos → casos → execuções → defeitos.
4. **Streaming.** A resposta é transmitida via **SSE** (Server-Sent Events),
   aparecendo aos poucos como num chat comum.
5. **Links clicáveis.** Ao citar um item, o modelo gera um link "abrir" que abre
   o caso/defeito/execução na tela correspondente, em nova aba (deep-link por
   query param: `?case=`, `?defect=`, `?run=`).

---

## Segurança

A proteção forte é **arquitetural**, não depende do modelo "se comportar":

- **Somente leitura** — nenhuma ferramenta escreve; impossível criar/editar/excluir.
- **Escopo do usuário (RLS)** — a função consulta o banco com o **JWT do próprio
  usuário** (nunca `service_role`). A IA só enxerga o que aquele usuário já vê na
  interface.
- **Preso ao projeto ativo** — toda ferramenta filtra por `project_id`.
- **Chave protegida** — a chave da API vive num *secret* do Supabase, servidor;
  nunca vai ao bundle do navegador.
- **Anti-injeção** — o conteúdo de casos/comentários é tratado como *dado*, nunca
  como instrução (o system prompt orienta ignorar "ordens" embutidas no texto).
- **Escopo de conversa** — o modelo recusa perguntas fora do projeto (conhecimento
  geral, código não relacionado etc.) e não revela suas próprias instruções.

> ⚠️ A trava de escopo/anti-injeção é uma camada *soft* (via prompt): boa para o
> uso normal, mas não é uma garantia dura. Além disso, o Assistente **não mascara
> dados sensíveis** que já estejam nos próprios testes (ex.: uma senha digitada
> num passo) — ele mostra o que o usuário já veria na tela.

---

## Provedor e modelo

Usa **Google Gemini** (`@google/genai`). O modelo é uma constante única no topo
de `supabase/functions/qa-chat/index.ts`:

```ts
const MODEL = 'gemini-flash-lite-latest';
```

- `gemini-flash-lite-latest` foi escolhido por ter **cota generosa no plano
  gratuito**. No free tier, os modelos flash 3.x mais novos permitem poucas
  requisições por dia (~20), e os modelos 2.0 têm cota 0.
- Com **billing** ativo (tier pago) na conta Google, troque para
  `gemini-flash-latest` ou `gemini-pro-latest` para mais qualidade — os limites
  deixam de ser um problema.
- O cache de prefixo (índice estável) é **implícito** no Gemini 2.5+.

Erros comuns são traduzidos para mensagens amigáveis: cota esgotada (429),
sobrecarga (503) e chave ausente/ inválida.

---

## Configuração / deploy

Secret necessário (além dos que já existem no projeto):

```bash
supabase secrets set GEMINI_API_KEY=...
supabase functions deploy qa-chat --no-verify-jwt
```

- `--no-verify-jwt` (também fixado em `supabase/config.toml`,
  `[functions.qa-chat]`): o chat é chamado por `fetch` cru para permitir
  streaming, e o *preflight* CORS (OPTIONS) não leva `Authorization`; por isso o
  gateway não pode exigir JWT. A própria função valida o JWT internamente
  (`auth.getUser` → 401).

Aplique também a migration das funções de agregação:

```
supabase/migrations/20260723120000_create_qa_chat_aggregates.sql
```

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `supabase/functions/qa-chat/index.ts` | Edge Function: índice, ferramentas, chamada ao Gemini, streaming SSE. |
| `supabase/migrations/20260723120000_create_qa_chat_aggregates.sql` | Funções SQL de agregação (`SECURITY INVOKER`). |
| `src/lib/qaChat.ts` | Cliente do front: `fetch` SSE, token da sessão, cancelamento. |
| `src/pages/tests/AssistentePage.tsx` | Tela do chat (bolhas, streaming, sugestões, histórico, links). |
| `src/components/Sidebar.tsx` · `src/main.tsx` | Item de menu "Assistente IA" e rota `/testes/assistente`. |

## Histórico da conversa

O histórico é salvo por projeto no `localStorage` (`qa_chat_hist_<projectId>`):
sobrevive à navegação e ao reload, e é **limpo no logout** (em `src/lib/auth.ts`).
Persistência em banco está fora de escopo — a conversa é memória do navegador.
