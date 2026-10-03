// Opening the Why drawer from anywhere in the app.

const WHY = "oscar:why";

export function openWhy(decisionId: string) {
  window.dispatchEvent(new CustomEvent<string>(WHY, { detail: decisionId }));
}

export function onOpenWhy(handler: (decisionId: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(WHY, listener);
  return () => window.removeEventListener(WHY, listener);
}
