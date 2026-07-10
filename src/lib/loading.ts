/* ═══════════════════════════════════════════════════════════
   loading.ts — Ponte do overlay de carregamento (porta de
   showLoading/hideLoading do export.js) para módulos não-React.
   ═══════════════════════════════════════════════════════════ */
type ShowFn = (text?: string) => void;
type HideFn = () => void;

let showFn: ShowFn = () => {};
let hideFn: HideFn = () => {};

export function registerLoadingHandlers(show: ShowFn, hide: HideFn): void {
  showFn = show;
  hideFn = hide;
}

export function showLoading(text = 'Gerando arquivo...'): void {
  showFn(text);
}

export function hideLoading(): void {
  hideFn();
}
