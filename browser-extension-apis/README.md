# Health Check de APIs — Status & Versões (Extensão)

Extensão de navegador (Manifest V3) que abre uma aba com o **status e a versão de
todas as APIs por ambiente** — o mesmo Health Check do QAReporter, porém standalone.
Clicar no ícone da extensão abre a aba `apis.html`.

## Como funciona

- O ícone na barra → **abre uma nova aba** com o painel.
- Escolha o **ambiente** (Dev Orion/Polaris, QA, TST Azul, STG, Produção) e clique **Verificar**.
- Para cada API, busca `<url>/HealthCheck?_=timestamp` (cache-busting, `no-store`) e mostra:
  **status** (Healthy/Degraded/Erro), **versão**, máquina, IP, HTTP e tempo (ms).
- Filtros: Todas / Healthy / Com erro.
- A busca é **direta** (sem proxy CORS) graças a `host_permissions` para os domínios das APIs.

## Instalar (modo desenvolvedor)

1. `chrome://extensions` → ative o **Modo do desenvolvedor**.
2. **Carregar sem compactação** → selecione a pasta `browser-extension-apis/`.
3. Clique no ícone (barra do navegador) → abre o painel.

## Dados das APIs (ambientes + serviços)

Vêm de `apis-data.js`, **gerado** a partir de `src/lib/apisStorage.ts` (fonte única):

```bash
node gen-data.mjs   # regrava apis-data.js (6 ambientes, 31 serviços)
```

Sempre que a lista de APIs do app mudar, rode de novo para sincronizar.

## Ícones

```bash
node make-icons.mjs   # regrava icon16/32/48/128.png (verde + barras)
```

## Limitações

- **Ambiente TST Azul é HTTP** (`http://...aws.voeazul.com.br`). A aba da extensão é
  um contexto seguro (`chrome-extension://`), então buscas `http://` são bloqueadas por
  **mixed content** → esses cards mostram "Sem acesso". Os demais ambientes são HTTPS e funcionam.
- Não roda em páginas internas (`chrome://`) — mas aqui isso não importa, pois o painel é uma página própria da extensão.

## Publicar na Chrome Web Store

Mesmo processo da outra extensão (taxa única US$ 5 por conta):

```bash
zip -r health-check-apis.zip manifest.json background.js apis.html apis.css apis.js apis-data.js icon16.png icon32.png icon48.png icon128.png
```

Upload no **[Developer Dashboard](https://chrome.google.com/webstore/devconsole)** → preencha listing, justifique `host_permissions` (consultar o endpoint de health das APIs) e `storage` (lembrar o ambiente). Para uso interno, prefira **"Não listado" (unlisted)** ou apenas *Load unpacked* (grátis).
