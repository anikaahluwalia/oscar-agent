// Oscar inside Gmail: he peeks out of the bottom-right corner with a count of what needs you,
// and opens a small panel with his call on the email you have open. Everything is drawn in a
// closed shadow root so Gmail's styles can't reach it, and every piece of email text goes in as
// text (never HTML), since subjects and senders come from strangers.

(() => {
  if (window.top !== window || document.getElementById("oscar-for-gmail")) return;

  const LEVELS = {
    PROCEED_SILENTLY: { words: "Quietly", tone: "handled" },
    PROCEED_AND_NOTIFY: { words: "Tell me", tone: "fyi" },
    ASK_FIRST: { words: "Asking first", tone: "needs" },
    ESCALATE: { words: "Held back", tone: "blocked" },
  };
  const mood = (name) => chrome.runtime.getURL(`moods/${name}.webp`);

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
    .wrap { --ink:#16171a; --muted:#5c5f68; --card:#ffffff; --line:#e6e6e9; --soft:#f2f2f4; --btn:#16171a; --btn-ink:#ffffff;
            --handled:#11613f; --fyi:#0e6276; --needs:#8a4b00; --blocked:#a11f15;
            --dot-handled:#2fb67a; --dot-fyi:#4a7cf0; --dot-needs:#e09a2b; --dot-blocked:#e05545; color: var(--ink); }
    @media (prefers-color-scheme: dark) {
      .wrap { --ink:#f2f2f3; --muted:#a3a6ae; --card:#1a1b1f; --line:#2a2b30; --soft:#222328; --btn:#f2f2f3; --btn-ink:#16171a;
              --handled:#6fd3a1; --fyi:#7cc8db; --needs:#f2b65c; --blocked:#f28b80; }
    }
    .peek { position: fixed; right: 28px; bottom: 0; z-index: 2147483000; width: 84px; height: 84px; padding: 0; border: 0;
            background: transparent; cursor: pointer; transform: translateY(30%); transition: transform .25s ease; }
    .peek:hover, .peek:focus-visible, .peek.up { transform: translateY(6%); }
    .peek:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; border-radius: 16px; }
    .peek img { width: 84px; height: 84px; display: block; filter: drop-shadow(0 6px 14px rgba(22,23,26,.18)); }
    /* Always charcoal with a white ring: it sits on Gmail's page, whatever theme the panel uses. */
    .badge { position: absolute; top: 2px; left: 0; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
             background: #16171a; color: #ffffff; box-shadow: 0 0 0 2px #ffffff; font-size: 12px; font-weight: 800;
             line-height: 22px; text-align: center; }
    @media (prefers-reduced-motion: reduce) { .peek { transition: none; } }
    .panel { position: fixed; right: 20px; bottom: 96px; z-index: 2147483000; width: 344px; max-width: calc(100vw - 40px);
             max-height: min(70vh, 620px); overflow: auto; padding: 16px; border-radius: 22px; background: var(--card);
             border: 1px solid var(--line); box-shadow: 0 18px 48px rgba(22,23,26,.18); display: flex; flex-direction: column; gap: 14px; }
    .panel[hidden] { display: none; }
    .head { display: flex; align-items: center; gap: 10px; }
    .head img { width: 52px; height: 52px; flex: none; }
    .title { flex: 1; margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
    .sub { margin: 2px 0 0; font-size: 13px; color: var(--muted); font-weight: 500; letter-spacing: 0; }
    .title .sub { display: block; }
    .close { width: 32px; height: 32px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: 20px; cursor: pointer; }
    .close:hover { background: var(--soft); }
    h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
    .card { padding: 12px 14px; border-radius: 16px; background: var(--soft); display: flex; flex-direction: column; gap: 8px; }
    .words { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .msg { margin: 0; font-size: 14px; line-height: 1.45; }
    .factors { margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--muted); display: flex; flex-direction: column; gap: 2px; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn { min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--ink);
           font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
    .btn.main { background: var(--btn); color: var(--btn-ink); border-color: var(--btn); }
    .btn:disabled { opacity: .5; cursor: default; }
    .list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
    .item { width: 100%; padding: 9px 4px; border: 0; border-top: 1px solid var(--line); background: transparent; color: var(--ink);
            text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border-radius: 8px; }
    .item:hover { background: var(--soft); }
    .item b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item span { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .note { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.45; }
    .foot { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .foot a { color: var(--ink); font-weight: 700; }
  `;

  // A tiny element builder. Text only ever goes in as text.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child) node.append(child);
    return node;
  }

  const ask = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (reply) => resolve(reply ?? { ok: false, error: "I can't reach Oscar right now." }));
      } catch {
        resolve({ ok: false, error: "Reload the page to reconnect to Oscar." });
      }
    });

  // The open email's thread id, as Gmail's page shows it (hex, the same id Gmail's API uses).
  function openThread() {
    const legacy = document.querySelector("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id");
    if (legacy && /^[0-9a-f]{6,32}$/i.test(legacy)) return legacy.toLowerCase();
    const perm = document.querySelector("[data-thread-perm-id]")?.getAttribute("data-thread-perm-id") ?? "";
    const decimal = perm.match(/thread-f:(\d+)/)?.[1];
    return decimal ? BigInt(decimal).toString(16) : null;
  }

  const host = el("div", { id: "oscar-for-gmail" });
  const root = host.attachShadow({ mode: "closed" });
  const wrap = el("div", { class: "wrap" });
  root.append(el("style", { text: CSS }), wrap);
  document.body.append(host);

  const state = { status: null, thread: null, threadId: null, open: false, error: null, said: null, busy: false };

  function words(level) {
    const l = LEVELS[level] ?? LEVELS.ASK_FIRST;
    return el("span", { class: "words", style: `color: var(--${l.tone})` },
      el("span", { class: "dot", style: `background: var(--dot-${l.tone})` }), l.words);
  }

  async function answer(item, kind) {
    state.busy = true;
    render();
    const reply = await ask({ type: "answer", id: item.id, kind });
    state.busy = false;
    state.said = reply.ok ? reply.data.reply : reply.error;
    await refresh();
  }

  function thisEmail() {
    const item = state.thread?.item;
    if (!state.threadId || !state.thread) return null;
    if (!item) return el("section", {}, el("h3", { text: "This email" }), el("p", { class: "note", text: "I haven't read this one yet." }));
    const app = state.status?.app ?? "http://localhost:3000";
    const buttons = [];
    if (item.answerable) {
      buttons.push(el("button", { class: "btn main", type: "button", onclick: () => answer(item, "APPROVE") }, "Approve"));
      buttons.push(el("button", { class: "btn", type: "button", onclick: () => answer(item, "REJECT") }, "Not this one"));
    }
    if (item.undoable) buttons.push(el("button", { class: "btn", type: "button", onclick: () => answer(item, "UNDO") }, "Undo"));
    const readOnly = item.thread_id && !item.acting;
    buttons.push(el("a", { class: "btn", href: `${app}/${readOnly ? "review" : "inbox"}#${item.id}`, target: "_blank", rel: "noopener" },
      readOnly ? "Check this call" : "Open in Oscar"));
    if (state.busy) buttons.forEach((b) => b.tagName === "BUTTON" && b.setAttribute("disabled", ""));
    return el("section", {},
      el("h3", { text: "This email" }),
      el("div", { class: "card" },
        words(item.level),
        el("p", { class: "msg", text: item.message }),
        item.factors?.length ? el("ul", { class: "factors" }, item.factors.slice(0, 2).map((f) => el("li", { text: f }))) : null,
        el("div", { class: "row" }, buttons)));
  }

  function waiting() {
    const items = (state.status?.waiting ?? []).filter((i) => i.thread_id !== state.threadId).slice(0, 5);
    if (!items.length) return null;
    return el("section", {},
      el("h3", { text: "Waiting on you" }),
      el("ul", { class: "list" }, items.map((i) =>
        el("li", {}, el("button", {
          class: "item", type: "button",
          onclick: () => { if (i.thread_id) location.hash = `#all/${i.thread_id}`; },
        }, el("b", { text: i.subject || "(no subject)" }), el("span", {}, words(i.level), ` · ${i.sender.replace(/<.*>/, "").trim()}`))))));
  }

  function render() {
    const status = state.status;
    const count = status?.count ?? 0;
    const stopped = status?.waiting?.some((i) => i.level === "ESCALATE");
    const face = !status || !count ? "sleeping" : stopped ? "guarding" : "asking";
    const label = !status ? "Oscar" : count ? `Oscar: ${count} ${count === 1 ? "thing" : "things"} for you` : "Oscar: nothing needs you";

    const peek = el("button", { class: `peek${state.open ? " up" : ""}`, type: "button", "aria-label": label, "aria-expanded": String(state.open),
      onclick: () => { state.open = !state.open; state.said = null; render(); if (state.open) refresh(); } },
      el("img", { src: mood(face), alt: "" }), count ? el("span", { class: "badge", text: count > 99 ? "99+" : String(count) }) : null);

    const app = status?.app ?? "http://localhost:3000";
    const panel = el("section", { class: "panel", role: "dialog", "aria-label": "Oscar" },
      el("div", { class: "head" },
        el("img", { src: mood(face), alt: "" }),
        el("p", { class: "title" }, count ? `${count} ${count === 1 ? "thing" : "things"} for you` : "All quiet",
          status?.read_only ? el("span", { class: "sub", text: "I only read Gmail for now" }) : null),
        el("button", { class: "close", type: "button", "aria-label": "Close", onclick: () => { state.open = false; render(); } }, "×")),
      state.error ? el("p", { class: "note", text: state.error }) : null,
      status && !status.connected ? el("p", { class: "note" }, "Connect Gmail in Oscar's ", el("a", { href: `${app}/settings`, target: "_blank", rel: "noopener" }, "Settings"), " first.") : null,
      state.said ? el("p", { class: "note", text: state.said }) : null,
      thisEmail(),
      waiting(),
      el("div", { class: "foot" }, el("a", { href: `${app}/today`, target: "_blank", rel: "noopener" }, "Open Oscar"),
        el("span", { class: "sub", text: "Nothing here changes without you." })));
    if (!state.open) panel.setAttribute("hidden", "");

    wrap.replaceChildren(peek, panel);
  }

  async function refresh() {
    const status = await ask({ type: "status" });
    state.status = status.ok ? status.data : state.status;
    state.error = status.ok ? null : status.error;
    state.threadId = openThread();
    if (state.threadId && status.ok) {
      const found = await ask({ type: "thread", id: state.threadId });
      state.thread = found.ok ? found.data : null;
    } else {
      state.thread = null;
    }
    render();
  }

  // The open email changes without a page load: watch the address, and check the page now and then.
  let lastThread = null;
  window.addEventListener("hashchange", () => setTimeout(refresh, 600));
  setInterval(() => {
    const now = openThread();
    if (now !== lastThread) {
      lastThread = now;
      refresh();
    }
  }, 1500);
  setInterval(refresh, 60_000);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) {
      state.open = false;
      render();
    }
  });

  render();
  refresh();
})();
