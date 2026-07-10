/* Visibilidade da bolinha por ABA (não por site): guardada em
   chrome.storage.session keyed por tabId — sobrevive a refresh e navegação
   entre sites na mesma aba, some ao fechar a aba/navegador. */
const KEY = 'fabVisByTab';

async function getMap() {
  const r = await chrome.storage.session.get(KEY);
  return r[KEY] || {};
}

/* Clicar no ícone da extensão mostra/oculta a bolinha na aba atual. */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const map = await getMap();
  map[tab.id] = !map[tab.id];
  await chrome.storage.session.set({ [KEY]: map });
  chrome.tabs.sendMessage(tab.id, { type: 'SET_FAB', visible: map[tab.id] }).catch(() => {
    /* aba sem content script (ex.: páginas internas chrome://) — ignora */
  });
});

/* Content script pergunta se deve aparecer nesta aba (ao carregar a página). */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GET_FAB_VIS' && sender.tab && sender.tab.id != null) {
    getMap().then((map) => sendResponse({ visible: !!map[sender.tab.id] }));
    return true; // resposta assíncrona
  }
});

/* Limpa o estado quando a aba fecha. */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getMap();
  if (tabId in map) {
    delete map[tabId];
    await chrome.storage.session.set({ [KEY]: map });
  }
});
