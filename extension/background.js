// The only part of the extension that talks to Oscar's API. Gmail's page never can: the content
// script asks here, by message, for one of a few things, and everything else is refused.

const DEFAULTS = { api: "http://localhost:8000", app: "http://localhost:3000" };
// The buttons in the panel, nothing else. The "always" ones and "for emails like this" teach him a
// rule. A yes to a rule also does the asks already waiting that it covers, as an Approve would
// (oscar/api.py, _approve_waiting); "always ask me" and "keep asking" change nothing in Gmail.
const ANSWERS = new Set(["APPROVE", "REJECT", "UNDO", "SEEN", "ALWAYS_DO_THIS", "ALWAYS_ASK_ME",
  "JUST_HANDLE_IT", "HANDLE_AND_TELL_ME", "KEEP_ASKING"]);
// "Was that right?": yes, or what he should have done instead. Lessons come from reviews, as on the Review page.
const LEVELS = new Set(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"]);
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
  if (message?.type === "threads" && Array.isArray(message.ids) && message.ids.length <= 100
      && message.ids.every((id) => typeof id === "string" && THREAD.test(id))) {
    return call(`/extension/threads?ids=${message.ids.join(",")}`);
  }
  if (message?.type === "review" && ID.test(message.id ?? "") && (message.level === null || LEVELS.has(message.level))) {
    const body = message.level ? { decision_id: message.id, should_be_level: message.level } : { decision_id: message.id, label: "CORRECT" };
    return call("/reviews", { method: "POST", body: JSON.stringify(body) });
  }
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
