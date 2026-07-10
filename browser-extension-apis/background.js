/* Clicar no ícone abre o painel de Health Check numa nova aba. */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('apis.html') });
});
