// The only part of the extension that talks to Oscar's API. Gmail's page never can: the content
// script asks here, by message, for one of three things, and everything else is refused.

const DEFAULTS = { api: "http://localhost:8000", app: "http://localhost:3000" };
const ANSWERS = new Set(["APPROVE", "REJECT", "UNDO"]); // the buttons in the panel, nothing else
const THREAD = /^[0-9a-f]{6,32}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function settings() {
  const saved = await chrome.storage.sync.get(DEFAULTS);
  return { api: saved.api.replace(/\/+$/, ""), app: saved.app.replace(/\/+$/, "") };
}

async function call(path, init) {
  const { api } = await settings();
  const response = await fetch(`${api}${path}`, { ...init, headers: { "content-type": "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `Oscar's API said no (${response.status}).`);
  return body;
}

async function handle(message) {
  if (message?.type === "status") return { ...(await call("/extension/status")), app: (await settings()).app };
  if (message?.type === "thread" && THREAD.test(message.id ?? "")) return call(`/extension/thread/${message.id}`);
  if (message?.type === "answer" && ID.test(message.id ?? "") && ANSWERS.has(message.kind)) {
    return call("/feedback", { method: "POST", body: JSON.stringify({ decision_id: message.id, kind: message.kind }) });
  }
  throw new Error("Not something Oscar's extension does.");
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // Only this extension's own content script, on Gmail.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith("https://mail.google.com/")) return false;
  handle(message).then(
    (data) => reply({ ok: true, data }),
    (error) => reply({ ok: false, error: error instanceof TypeError ? "I can't reach Oscar. Is the API running?" : error.message }),
  );
  return true; // the reply comes later
});
