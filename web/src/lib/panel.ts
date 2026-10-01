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
