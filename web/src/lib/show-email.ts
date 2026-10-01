// Opening one email's row, for chips in the chat. On another page the link's #id does it instead.

const SHOW = "oscar:show";

export function showEmail(decisionId: string) {
  window.dispatchEvent(new CustomEvent<string>(SHOW, { detail: decisionId }));
}

export function onShowEmail(handler: (decisionId: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(SHOW, listener);
  return () => window.removeEventListener(SHOW, listener);
}
