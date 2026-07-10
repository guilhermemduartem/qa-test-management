# Gerador de Dados — Extensão

Bolinha flutuante para gerar **dados de teste válidos** em **qualquer site**.
Manifest V3 — Chrome, Edge, Brave, Opera.

## Instalar (modo desenvolvedor)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** / **Load unpacked**.
4. Selecione esta pasta `browser-extension/`.

## Funcionalidades

| Tab | O que gera |
|---|---|
| CPF | Válido (com ou sem máscara) |
| RG | Válido (com ou sem máscara) |
| CNPJ | Numérico ou alfanumérico (IN RFB 2.229/2024), com ou sem máscara |
| Pass. | Passaporte 🇧🇷 Brasil (2L+6D) ou 🌐 Internacional ICAO 9303 (2L+7D) |
| Email | Aleatório com nomes comuns BR, gregos e apelidos engraçados |
| Endereço | Endereço BR completo (rua, bairro, cidade, estado, CEP) |
| UUID | UUID v4 |
| Lorem | Lorem Ipsum com 10 / 25 / 50 / 100 palavras |
| Chat IA | Prompt livre → abre ChatGPT; atalhos prontos: BDD, Caso de Teste, Corrigir, Resumir, Traduzir |

## Usar

- **Clique** na bolinha → abre/fecha o painel.
- **Arraste** a bolinha para reposicionar (a posição é lembrada).
- **Clique no ícone da extensão** (barra do navegador) → mostra/oculta a bolinha na aba atual.
- `Esc` ou botão ✕ → fecha o painel (clicar fora do painel não fecha).
- Estado da bolinha (visível/oculta) persiste ao atualizar a aba, mas é isolado por aba.

## Notas técnicas

- A UI roda em **Shadow DOM** → não herda nem vaza CSS do site.
- Visibilidade por aba salva em `sessionStorage` (persiste no refresh, isolado por aba).
- Posição, aba ativa e opções salvos em `chrome.storage.local` (fallback `localStorage`).
- Geradores de CPF/RG/CNPJ com dígitos verificadores; CNPJ alfanumérico conforme IN RFB 2.229/2024.
- Não acessa nem envia nada pela rede; só `permissions: ["storage"]`.
- Não roda em `chrome://`, `edge://` nem na Chrome Web Store (restrição da plataforma).

## Ícones

Os ícones (`icon16/32/48/128.png`) são gerados por `make-icons.mjs`:

```bash
node make-icons.mjs
```

## Publicar na Chrome Web Store

### 1. Gerar o pacote (.zip)
```bash
cd browser-extension
zip -r gerador-dados.zip manifest.json content.js background.js icon16.png icon32.png icon48.png icon128.png
```

### 2. Dashboard
- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) — taxa única de US$ 5.
- **Add new item** → upload do `.zip` → preencha Store listing, Privacy (justifique `storage` e `<all_urls>`).
- **Distribuição**: público ou *unlisted* (só quem tem o link instala — bom para uso interno).

### Alternativa sem loja
Distribua a pasta e cada pessoa carrega via *Load unpacked*, ou gere um `.crx` via `chrome://extensions`.

> Antes de publicar, remova os `console.log('[Gerador de Dados] …')` do `content.js`.
