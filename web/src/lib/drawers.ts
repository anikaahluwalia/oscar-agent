// Opening the Why and Ask Oscar drawers from anywhere in the app.

const WHY = "oscar:why";
const CHAT = "oscar:chat";

export function openWhy(decisionId: string) {
  window.dispatchEvent(new CustomEvent<string>(WHY, { detail: decisionId }));
}

export function onOpenWhy(handler: (decisionId: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(WHY, listener);
  return () => window.removeEventListener(WHY, listener);
}

/** Opens the chat drawer, or closes it with open=false (for example after tapping a link in it). */
export function openChat(open = true) {
  window.dispatchEvent(new CustomEvent<boolean>(CHAT, { detail: open }));
}

export function onOpenChat(handler: (open: boolean) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<boolean>).detail);
  window.addEventListener(CHAT, listener);
  return () => window.removeEventListener(CHAT, listener);
}
