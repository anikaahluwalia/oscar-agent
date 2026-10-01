// Opening Oscar's side panel from anywhere in the app (for example "Why?" on a card).

export type PanelRequest = { tab: "live" | "chat"; message?: string; decisionId?: string };

const OPEN = "oscar:panel";

export function openOscar(request: PanelRequest) {
  window.dispatchEvent(new CustomEvent<PanelRequest>(OPEN, { detail: request }));
}

export function onOpenOscar(handler: (request: PanelRequest) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<PanelRequest>).detail);
  window.addEventListener(OPEN, listener);
  return () => window.removeEventListener(OPEN, listener);
}

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
