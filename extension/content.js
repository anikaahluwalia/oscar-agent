// Oscar inside Gmail, in three parts:
//  - a chip on each email in Gmail's list with his call: Handled, FYI, Needs you or Stopped;
//  - Oscar at the bottom of the page (right by default, wherever you drag him). When Gmail opens he
//    says hello and whether anything needs you, then shows one card at a time: all caught up, what
//    needs you, something he handled, an approval, something he stopped, and "was that right?";
//  - a panel down the right for the open email: Summary, Actions, Why? and Thread. It opens by
//    itself every time you open an email. Closing it hides it while you stay on that email.
// Everything is drawn in closed shadow roots so Gmail's styles can't reach it, and every piece of
// email text goes in as text (never HTML), since subjects and senders come from strangers.

(() => {
  if (window.top !== window || document.getElementById("oscar-for-gmail")) return;

  // His call on an email, in the app's words. The Gmail labels are only Stopped, Needs you and FYI
  // (handled emails get none), and can be renamed in Settings (oscar/labels.py).
  const STATUS = {
    Handled: { tone: "handled", icon: "check", why: "Why I handled it" },
    FYI: { tone: "fyi", icon: "bell", why: "Why I'm telling you" },
    "Needs you": { tone: "needs", icon: "question", why: "Why I'm asking" },
    Stopped: { tone: "blocked", icon: "shield", why: "Why I stopped it" },
  };
  const DOING = {
    ARCHIVE: "Archive it", MARK_READ: "Mark it as read", APPLY_LABEL: "Label it", DRAFT_REPLY: "Draft a reply",
    SEND_REPLY: "Reply", FORWARD: "Forward it", UNSUBSCRIBE: "Unsubscribe", ACCEPT_MEETING: "Accept the invite",
    PERMANENTLY_DELETE: "Delete it for good", SEND_CREDENTIALS: "Send login details", MOVE_MONEY: "Send money",
  };
  const DID = { ARCHIVE: "Archived", MARK_READ: "Marked as read", APPLY_LABEL: "Labelled", DRAFT_REPLY: "Drafted a reply" };
  // What he did, naming the label for "Label it": 'Labelled "Receipts"'. The name is the one from
  // Oscar's Settings, sent by the API with each email.
  const didWords = (item, action) =>
    action === "APPLY_LABEL" && item.label ? `Labelled "${item.label}"` : DID[action] ?? "Done";
  const LIKE_THIS_ACTIONS = new Set(["ARCHIVE", "MARK_READ", "APPLY_LABEL"]);
  const INSTEAD = [
    ["ASK_FIRST", "Should have asked"], ["PROCEED_AND_NOTIFY", "Should have told me"],
    ["PROCEED_SILENTLY", "Fine to do quietly"], ["ESCALATE", "Should have stopped it"],
  ];
  const PATHS = {
    check: "M5 12.5l4.5 4.5L19 7.5",
    bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
    question: "M9.2 9a3 3 0 1 1 4.3 2.7c-.9.5-1.5 1.1-1.5 2.1V15M12 18.5v.01",
    shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM12 8v5M12 16v.01",
    thumb: "M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.7 10H18a2 2 0 0 1 2 2.3l-1.2 6a2 2 0 0 1-2 1.7H7",
    pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
    close: "M6 6l12 12M18 6L6 18",
    chevron: "M6 9l6 6 6-6",
  };
  // After the extension is reloaded or updated, this copy keeps running in an open Gmail tab but
  // can't reach Chrome any more ("Extension context invalidated"). It then tidies itself away
  // (retire, below) and the new copy takes over when Gmail is next loaded.
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const url = (path) => (alive() ? chrome.runtime.getURL(path) : "");
  const mood = (name) => url(`moods/${name}.webp`);
  const today = () => new Date().toDateString();
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
  const address = (sender) => sender.match(/<([^>]+)>/)?.[1] ?? sender;

  const TOKENS = `
    .wrap { --ink:#16171a; --muted:#5c5f68; --card:#ffffff; --line:#e6e6e9; --soft:#f4f4f6; --btn:#2b2d33; --btn-ink:#ffffff;
            --handled:#11613f; --fyi:#2c55c7; --needs:#8a4b00; --blocked:#b0231a;
            --handled-bg:#e3f5ea; --fyi-bg:#e6ecfd; --needs-bg:#fdf0dc; --blocked-bg:#fde6e3; color: var(--ink); }
    .wrap.dark { --ink:#f2f2f3; --muted:#a3a6ae; --card:#1a1b1f; --line:#2c2d33; --soft:#232429; --btn:#f2f2f3; --btn-ink:#16171a;
                 --handled:#7fd9aa; --fyi:#9db6ff; --needs:#f4bd6a; --blocked:#f59a90;
                 --handled-bg:#18352a; --fyi-bg:#1d2747; --needs-bg:#3a2a12; --blocked-bg:#3d1c19; }`;

  // Dark only when Gmail itself is: Gmail has its own theme, whatever the computer's setting.
  function gmailIsDark() {
    for (const node of [document.querySelector(".nH"), document.body, document.documentElement]) {
      const rgb = node && getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (rgb && (rgb.length < 4 || rgb[3] > 0)) return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 110;
    }
    return false;
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Google Sans", "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
    ${TOKENS}
    button { font: inherit; color: inherit; }
    svg { flex: none; }
    a { color: inherit; }

    /* Oscar at the bottom of the page. */
    .peek { position: fixed; bottom: 0; z-index: 2147483000; touch-action: none; width: 84px; height: 84px; padding: 0; border: 0;
            background: transparent; cursor: pointer; transform: translateY(30%); transition: transform .25s ease; }
    .peek:hover, .peek:focus-visible, .peek.up { transform: translateY(6%); }
    .peek:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; border-radius: 16px; }
    .peek img { width: 84px; height: 84px; display: block; pointer-events: none; -webkit-user-drag: none; user-select: none;
                filter: drop-shadow(0 6px 14px rgba(22,23,26,.18)); }
    .peek.dragging { cursor: grabbing; transition: none; transform: translateY(6%); }
    /* Always charcoal with a white ring: it sits on Gmail's page, whatever theme the panel uses. */
    .badge { position: absolute; top: 2px; left: 0; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
             background: #16171a; color: #ffffff; box-shadow: 0 0 0 2px #ffffff; font-size: 12px; font-weight: 800;
             line-height: 22px; text-align: center; }
    @media (prefers-reduced-motion: reduce) { .peek, .note, .note.going { transition: none; animation: none; } }
    /* "Animate" off in Oscar's Settings. */
    .still .peek, .still .note, .still .note.going { transition: none; animation: none; }

    /* One card at a time, just above him. */
    .note { position: fixed; bottom: 82px; z-index: 2147483000; width: 292px; max-width: calc(100vw - 32px); padding: 14px 16px;
            border-radius: 20px; background: var(--card); border: 1px solid var(--line); box-shadow: 0 14px 40px rgba(22,23,26,.16);
            display: flex; flex-direction: column; gap: 8px; animation: rise .22s ease; }
    .note.bubble { width: auto; max-width: 260px; padding: 12px 44px 12px 16px; }
    .note.going { opacity: 0; transform: translateY(6px); transition: opacity .4s ease, transform .4s ease; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
    .note .x { position: absolute; top: 8px; right: 8px; }
    .note-title { margin: 0; padding-right: 26px; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .note-text { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
    .note-text b { color: var(--ink); font-weight: 600; }
    .tick { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex: none; }

    /* The panel down the right side. */
    .panel { position: fixed; top: 8px; right: 8px; bottom: 8px; z-index: 2147483001; width: 372px; max-width: calc(100vw - 16px);
             border-radius: 22px; background: var(--card); border: 1px solid var(--line); box-shadow: 0 18px 56px rgba(22,23,26,.2);
             display: flex; flex-direction: column; overflow: hidden; }
    .panel[hidden], .peek[hidden], .note[hidden] { display: none; }
    .head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 6px 16px; }
    .head img { width: 36px; height: 36px; border-radius: 50%; }
    .name { flex: 1; margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .name small { display: block; font-size: 12px; font-weight: 500; color: var(--muted); letter-spacing: 0; }
    .x { width: 32px; height: 32px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); cursor: pointer;
         display: grid; place-items: center; }
    .x:hover { background: var(--soft); }
    .tabs { display: flex; gap: 4px; padding: 6px 12px 10px; border-bottom: 1px solid var(--line); }
    .tab { border: 0; background: transparent; padding: 7px 12px; border-radius: 10px; font-size: 13px; font-weight: 600;
           color: var(--muted); cursor: pointer; }
    .tab:hover { background: var(--soft); }
    .tab[aria-selected="true"] { background: var(--fyi-bg); color: var(--fyi); }
    .body { flex: 1; overflow: auto; padding: 14px 14px 120px; display: flex; flex-direction: column; gap: 12px; }
    .box { padding: 14px 16px; border-radius: 16px; background: var(--soft); display: flex; flex-direction: column; gap: 8px; }
    .box.handled { background: var(--handled-bg); } .box.fyi { background: var(--fyi-bg); }
    .box.needs { background: var(--needs-bg); } .box.blocked { background: var(--blocked-bg); }
    .box.plain { background: var(--card); border: 1px solid var(--line); }
    .subject { margin: 0; font-size: 15px; font-weight: 700; }
    .text { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
    .text.ink { color: var(--ink); }
    h3 { margin: 0; font-size: 14px; font-weight: 700; }
    .rec { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--card);
           font-size: 13px; font-weight: 600; line-height: 1.4; }
    .rec svg { color: var(--fyi); }
    .state { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; border: 0; border-radius: 14px;
             cursor: pointer; font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; text-align: left; }
    .state span { flex: 1; }
    .state i { display: grid; transition: transform .2s ease; }
    .state i.open { transform: rotate(180deg); }
    .handled-t { color: var(--handled); } .fyi-t { color: var(--fyi); } .needs-t { color: var(--needs); } .blocked-t { color: var(--blocked); }
    .bg-handled { background: var(--handled-bg); } .bg-fyi { background: var(--fyi-bg); }
    .bg-needs { background: var(--needs-bg); } .bg-blocked { background: var(--blocked-bg); }
    ul.why { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: var(--muted); }
    .row { display: flex; flex-wrap: wrap; gap: 8px; }
    .stack { display: flex; flex-direction: column; gap: 10px; }
    .btn { min-height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--ink);
           font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
           justify-content: center; gap: 6px; }
    .btn:hover { background: var(--soft); }
    .btn.main { background: var(--btn); color: var(--btn-ink); border-color: var(--btn); }
    .btn.wide { flex: 1; }
    .btn:disabled { opacity: .5; cursor: default; }
    .thumbs { display: flex; gap: 8px; }
    .thumb { width: 40px; height: 40px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; }
    .thumb.up { background: var(--handled-bg); color: var(--handled); }
    .thumb.down { background: var(--blocked-bg); color: var(--blocked); }
    .thumb.down svg { transform: rotate(180deg); }
    .thumb[aria-pressed="true"] { box-shadow: 0 0 0 2px currentColor; }
    label.pick { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
    select { height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: inherit; font-size: 13px; }
    .list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .item { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); color: var(--ink);
            text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
    .item:hover { background: var(--soft); }
    .item.on { border-color: var(--fyi); }
    .item b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item small { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line);
            font-size: 12px; color: var(--muted); background: var(--card); position: relative; z-index: 1; }
    .foot a { font-weight: 700; color: var(--ink); }
    .buddy { position: absolute; right: 12px; bottom: 40px; width: 92px; height: 92px; pointer-events: none;
             filter: drop-shadow(0 6px 14px rgba(22,23,26,.18)); }
    .said { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--soft); font-size: 13px; line-height: 1.45; }
  `;

  // A tiny element builder. Text only ever goes in as text.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) if (child) node.append(child);
    return node;
  }
  function icon(name, size = 16) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor",
      "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", PATHS[name]);
    svg.append(path);
    return svg;
  }
  const chip = (status) => {
    const s = STATUS[status] ?? STATUS.FYI;
    return el("span", { class: `chip bg-${s.tone} ${s.tone}-t` }, icon(s.icon, 12), status);
  };

  const ask = (message) =>
    new Promise((resolve) => {
      if (!alive()) {
        retire();
        resolve({ ok: false, error: "Reload the page to reconnect to Oscar." });
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (reply) => resolve(reply ?? { ok: false, error: "I can't reach Oscar right now." }));
      } catch {
        resolve({ ok: false, error: "Reload the page to reconnect to Oscar." });
      }
    });

  // The thread id of a list row or the open email, in hex: the same id Gmail's API uses. Newer
  // Gmail markup has it in decimal ("thread-f:..."), so that's converted.
  function threadOf(node) {
    if (!node) return null;
    const legacy = node.querySelector("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id");
    if (legacy && /^[0-9a-f]{6,32}$/i.test(legacy)) return legacy.toLowerCase();
    const perm = node.querySelector("[data-thread-perm-id], [data-thread-id]");
    const raw = perm?.getAttribute("data-thread-perm-id") ?? perm?.getAttribute("data-thread-id") ?? "";
    const decimal = raw.match(/thread-f:(\d+)/)?.[1];
    return decimal ? BigInt(decimal).toString(16) : null;
  }
  // The open email: the subject heading of Gmail's reading pane (h2.hP) carries the thread id.
  // Gmail can keep an email you left hidden on the page, so only a heading you can see counts.
  const openThread = () => threadOf([...document.querySelectorAll("h2.hP")].find((h) => h.offsetParent)?.parentElement);
  // Gmail's address says an email is open before the email is on the page: #inbox/<id>,
  // #label/Receipts/<id>, #search/invoice/<id>, #all/<id> and so on. The id is the thread id in hex
  // in older links (and the ones Oscar makes), or Gmail's newer long id, which isn't one.
  function hashEmail() {
    const parts = location.hash.replace(/^#/, "").split("?")[0].split("/");
    const deep = ["label", "search", "category", "advanced-search"].includes(parts[0]) ? 3 : 2;
    const id = parts.length >= deep ? parts[parts.length - 1] : "";
    return /^([0-9a-f]{12,20}|[A-Za-z0-9]{24,})$/.test(id) ? id : null;
  }
  // Where you are. visit is the email you're on, from the address (or, with no id in it, from the
  // email on the page, as in some reading pane layouts); thread is its thread id once Gmail shows
  // it. Both are null in your list.
  function where() {
    const inHash = hashEmail();
    const thread = openThread() ?? (/^[0-9a-f]+$/.test(inHash ?? "") ? inHash : null);
    return { visit: inHash ?? thread, thread };
  }

  const host = el("div", { id: "oscar-for-gmail" });
  const root = host.attachShadow({ mode: "closed" });
  const wrap = el("div", { class: "wrap" });
  let dark = false;
  root.append(el("style", { text: CSS }), wrap);
  document.body.append(host);

  const state = {
    status: null, error: null, threadId: null, thread: null, focus: null, // the open email, and which of its emails is shown
    pinned: null, // an email you picked from a card or list, shown until Gmail has it open
    visit: undefined, // the email you're on (see where), or null in your list; undefined until he's looked
    closed: false, // you closed the panel on this email: it stays closed until you leave it
    listing: false, // "Show me": the panel shows what's waiting, even on an email
    open: false, tab: "summary", whyOpen: true, busy: false, said: null,
    card: null, // what the card above Oscar shows: { kind, item, wrong? }
    feedback: {}, // decision id -> "down" while you pick what he should have done
    spot: 1, // where Oscar sits along the bottom: 0 is the far left, 1 the far right
    byHimself: false, // the panel opened because you opened an email, not because you asked
  };
  // What you've already seen, so each card shows once. Kept in this browser only.
  let memory = { seen: [], quietDay: null, quietCount: null, started: false, position: null };

  const SIZE = 84, EDGE = 24;
  const leftFor = (spot) => EDGE + spot * Math.max(0, window.innerWidth - SIZE - 2 * EDGE);
  const spotFor = (left) => Math.min(1, Math.max(0, (left - EDGE) / Math.max(1, window.innerWidth - SIZE - 2 * EDGE)));
  const keep = () => {
    try { chrome.storage.local.set({ spot: state.spot, memory }); } catch { /* fine: it's only a convenience */ }
  };
  let loaded = false;
  try {
    chrome.storage.local.get({ spot: 1, memory }, (saved) => {
      state.spot = typeof saved?.spot === "number" ? saved.spot : 1;
      memory = { ...memory, ...(saved?.memory ?? {}) };
      loaded = true;
      refresh();
    });
  } catch {
    loaded = true; // storage unavailable: he stays on the right, and cards may show again
    setTimeout(() => refresh(), 0);
  }

  // --- the cards above Oscar ---------------------------------------------------------------

  const seen = (id) => memory.seen.includes(id);
  function markSeen(id) {
    if (!id || seen(id)) return;
    memory.seen = [...memory.seen, id].slice(-300);
    keep();
  }

  // The most important thing you haven't seen yet, one at a time. Only the kinds you turned on
  // under Notifications in Oscar's Settings (safety stops and approvals on, what he handled off).
  function nextCard() {
    const s = state.status;
    if (!s?.connected) return null;
    const notify = { approvals: true, safety: true, handled: false, ...(s.settings?.notify ?? {}) };
    // "Stopped" is only what a safety rule stopped; anything else waiting on you is "Needs you".
    const stopped = notify.safety && s.waiting.find((i) => i.status === "Stopped" && !seen(i.id));
    if (stopped) return { kind: "stopped", item: stopped };
    const asking = notify.approvals && s.waiting.find((i) => i.status !== "Stopped" && !seen(i.id));
    if (asking) return { kind: "approval", item: asking };
    // What he did on his own: shown when you turned that on, and always for what he does and tells
    // you about ("Tell me"), like a reply he drafted.
    const handled = (s.recent ?? []).find((i) => !seen(i.id) && (notify.handled || i.level === "PROCEED_AND_NOTIFY"));
    if (handled) return { kind: "handled", item: handled };
    if ((notify.approvals || notify.safety) && s.count && memory.quietCount !== s.count) return { kind: "attention" };
    if (!s.count && memory.quietDay !== today()) return { kind: "idle" };
    return null;
  }

  function dismiss() {
    const card = state.card;
    if (card?.item) markSeen(card.item.id);
    if (card?.kind === "attention") memory.quietCount = state.status?.count ?? null;
    if (card?.kind === "idle") memory.quietDay = today();
    if (card?.kind === "hello") {
      // The hello already said it, so the "all caught up" and "need you" cards don't say it again.
      clearTimeout(helloTimer);
      if (state.status?.connected) {
        if (state.status.count) memory.quietCount = state.status.count;
        else memory.quietDay = today();
      }
    }
    keep();
    state.said = null;
    // After something he did on his own, ask if it was right (once).
    state.card = card?.kind === "handled" && !card.item.reviewed ? { kind: "feedback", item: card.item } : nextCard();
    render();
  }

  function showEmail(item, tab = "summary") {
    if (item?.id) markSeen(item.id);
    if (state.card?.kind === "attention") memory.quietCount = state.status?.count ?? null;
    keep();
    state.card = null;
    state.said = null;
    state.open = true;
    state.byHimself = false;
    state.listing = false;
    state.tab = tab;
    state.focus = item?.id ?? null;
    state.pinned = item?.thread_id && item.thread_id !== openThread() ? item : null;
    if (state.pinned) location.hash = `#all/${item.thread_id}`;
    render();
    refresh();
  }

  const POSE = { idle: "sleeping", attention: "thinking", handled: "proud", approval: "asking", stopped: "guarding", feedback: "learning" };

  // What he says when Gmail opens, from the same status as his badge. "Show me" only when
  // something is waiting. A safety stop is only mentioned when safety cards are on.
  function hello() {
    const s = state.status;
    if (state.error || !s) {
      return { pose: "thinking", title: "I can't reach my API right now.", text: "Is Oscar running? I'll keep checking." };
    }
    if (!s.connected) {
      return { pose: "sleeping", title: "I'm not reading your Gmail yet.", text: "Connect Gmail in Oscar's Settings and I'll get started." };
    }
    const handled = s.handled_today ? `I handled ${s.handled_today} today.` : "";
    if (!s.count) return { pose: "proud", title: "All handled!", text: `Nothing needs you right now. ${handled}`.trim() };
    const notify = { safety: true, ...(s.settings?.notify ?? {}) };
    const stopped = notify.safety ? s.stopped ?? s.waiting.filter((i) => i.status === "Stopped").length : 0;
    return { pose: stopped ? "guarding" : "alert", more: true,
      title: `${s.count} ${s.count === 1 ? "email needs" : "emails need"} you.`,
      text: [stopped ? `I stopped ${stopped} that looked risky.` : "", handled].filter(Boolean).join(" ") };
  }
  // Worth saying at all: not when you turned off the cards about what's waiting and something is.
  function helloWorth() {
    const s = state.status;
    const notify = { approvals: true, safety: true, ...(s?.settings?.notify ?? {}) };
    return !s?.connected || !s.count || notify.approvals || notify.safety;
  }

  // The hello goes by itself after 8 seconds, but not while you're pointing at it.
  let helloTimer = null;
  function fadeHello(ms = 8000) {
    clearTimeout(helloTimer);
    helloTimer = setTimeout(() => {
      wrap.querySelector(".note.hello")?.classList.add("going");
      helloTimer = setTimeout(() => state.card?.kind === "hello" && dismiss(), 400);
    }, ms);
  }
  function holdHello() {
    clearTimeout(helloTimer);
    wrap.querySelector(".note.hello")?.classList.remove("going");
  }
  // "Show me": the panel, with the list of what's waiting.
  function showWaiting() {
    dismiss();
    state.open = true;
    state.byHimself = false;
    state.listing = true;
    state.said = null;
    render();
    refresh();
  }

  function card() {
    const c = state.card;
    if (!c || state.open) return null;
    const close = el("button", { class: "x", type: "button", "aria-label": "Dismiss", onclick: dismiss }, icon("close"));
    const s = state.status;
    const side = state.spot < 0.5 ? `left: ${Math.max(12, leftFor(state.spot))}px`
      : `right: ${Math.max(12, window.innerWidth - leftFor(state.spot) - SIZE)}px`;
    const note = (cls, ...children) => el("section", { class: `note ${cls}`, role: "status", style: side }, close, ...children);

    if (c.kind === "hello") {
      const hi = hello();
      const bubble = note("bubble hello", el("p", { class: "note-title", text: hi.title }),
        hi.text ? el("p", { class: "note-text", text: hi.text }) : null,
        hi.more ? el("div", {}, el("button", { class: "btn", type: "button", onclick: showWaiting }, "Show me")) : null);
      bubble.addEventListener("mouseenter", holdHello);
      bubble.addEventListener("mouseleave", () => fadeHello(3000));
      return bubble;
    }
    if (c.kind === "idle") {
      return note("bubble", el("p", { class: "note-title", text: "All caught up!" }),
        el("p", { class: "note-text", text: s.handled_today ? `${s.handled_today} handled today` : "Nothing needs you." }));
    }
    if (c.kind === "attention") {
      return note("bubble", el("p", { class: "note-title" }, el("span", { class: "tick bg-needs needs-t" }, icon("question", 14)),
        `${s.count} ${s.count === 1 ? "email needs" : "emails need"} you`),
      el("div", {}, el("button", { class: "btn", type: "button", onclick: () => showEmail(s.waiting[0]) }, "Show me")));
    }
    const item = c.item;
    if (state.said && c.kind !== "feedback") return note("", el("p", { class: "note-text", text: state.said }));
    if (c.kind === "handled") {
      return note("", el("p", { class: "note-title" }, el("span", { class: "tick bg-handled handled-t" }, icon("check", 14)), "Oscar handled this"),
        el("p", { class: "note-text" }, `${didWords(item, item.done?.action)} · `, el("b", { text: item.subject || "(no subject)" })),
        el("div", { class: "row" },
          el("button", { class: "btn", type: "button", disabled: state.busy, onclick: () => answer(item, "UNDO", () => {
            markSeen(item.id);
            state.card = { kind: "feedback", item, wrong: true };
            state.feedback[item.id] = "down";
          }) }, "Undo"),
          el("button", { class: "btn", type: "button", onclick: () => showEmail(item) }, "Open")));
    }
    if (c.kind === "approval") {
      return note("", el("p", { class: "note-title", text: item.answerable ? "I need your approval" : "This one needs you" }),
        el("p", { class: "note-text" }, el("b", { text: item.subject || "(no subject)" }), ` from ${address(item.sender)}. ${item.message}`),
        el("div", { class: "row" },
          el("button", { class: "btn main", type: "button", onclick: () => showEmail(item) }, "Review"),
          el("button", { class: "btn", type: "button", onclick: dismiss }, "Not now")));
    }
    if (c.kind === "stopped") {
      return note("", el("p", { class: "note-title" }, el("span", { class: "tick bg-blocked blocked-t" }, icon("shield", 14)), "Oscar stopped here"),
        el("p", { class: "note-text" }, el("b", { text: item.subject || "(no subject)" }), `. ${item.message}`),
        el("button", { class: "btn wide", type: "button", onclick: () => showEmail(item, "why") }, "See why"));
    }
    if (c.kind === "feedback") {
      return note("", el("p", { class: "note-title", text: c.wrong ? "What should I have done?" : "Was that right?" }),
        el("p", { class: "note-text" }, el("b", { text: item.subject || "(no subject)" })),
        state.said ? el("p", { class: "note-text", text: state.said }) : rightOrNot(item, true));
    }
    return null;
  }

  // Thumbs up, or thumbs down and what he should have done instead. Saved as a review.
  function rightOrNot(item, compact = false) {
    const down = state.feedback[item.id] === "down";
    return el("div", { class: "stack" },
      el("div", { class: "thumbs" },
        el("button", { class: "thumb up", type: "button", "aria-label": "Yes, that was right", disabled: state.busy,
          onclick: () => review(item, null) }, icon("thumb", 18)),
        el("button", { class: "thumb down", type: "button", "aria-label": "No", "aria-pressed": String(down), disabled: state.busy,
          onclick: () => { state.feedback[item.id] = down ? null : "down"; render(); } }, icon("thumb", 18))),
      down ? el("label", { class: "pick" }, compact ? "Tell Oscar what to do instead" : "What should I have done?",
        el("select", { disabled: state.busy, onchange: (e) => e.target.value && review(item, e.target.value) },
          el("option", { value: "", text: "Pick one" }),
          INSTEAD.filter(([level]) => level !== item.level).map(([level, words]) => el("option", { value: level, text: words })))) : null);
  }

  // --- talking to Oscar ----------------------------------------------------------------------

  async function answer(item, kind, after) {
    state.busy = true;
    render();
    const reply = await ask({ type: "answer", id: item.id, kind });
    state.busy = false;
    state.said = reply.ok ? reply.data.reply : reply.error;
    if (reply.ok && after) after();
    await refresh();
    setTimeout(() => { state.said = null; render(); }, reply.ok ? 2600 : 5000);
  }

  async function review(item, level) {
    state.busy = true;
    render();
    const reply = await ask({ type: "review", id: item.id, level });
    state.busy = false;
    state.feedback[item.id] = null;
    state.said = reply.ok ? "Thanks! I'll remember that." : reply.error;
    if (reply.ok) markSeen(item.id);
    await refresh();
    setTimeout(() => {
      state.said = null;
      if (reply.ok && state.card?.kind === "feedback") state.card = nextCard();
      render();
    }, reply.ok ? 2200 : 5000);
  }

  // --- the panel ---------------------------------------------------------------------------

  const shown = () => state.pinned ?? (state.thread?.thread ?? []).find((i) => i.id === state.focus) ?? state.thread?.item ?? null;

  function recommends(item) {
    if (item.status === "Stopped") return "Leave it with me. Don't reply, click its links or send anything.";
    if (item.level === "ESCALATE") return "This one's for you. I haven't done anything with it.";
    if (item.undoable) return `${didWords(item, item.done.action)}. You can undo it if that wasn't right.`;
    const doing = DOING[item.action] ?? "Look at it";
    return item.level === "ASK_FIRST" ? `${doing}, once you say yes.` : `${doing}.`;
  }

  function mainButtons(item) {
    const app = state.status?.app ?? "http://localhost:3000";
    const out = [];
    if (item.answerable) {
      out.push(el("button", { class: "btn main wide", type: "button", disabled: state.busy, onclick: () => answer(item, "APPROVE") }, "Approve"));
      out.push(el("button", { class: "btn", type: "button", disabled: state.busy, onclick: () => answer(item, "REJECT") }, "Not this one"));
    } else if (item.undoable) {
      if (item.done?.draft) {  // a reply he drafted: it's in this thread, and in Drafts
        out.push(el("a", { class: "btn main wide", href: "https://mail.google.com/mail/u/0/#drafts", target: "_top" }, "Open draft"));
      }
      out.push(el("button", { class: "btn wide", type: "button", disabled: state.busy, onclick: () => answer(item, "UNDO") }, "Undo"));
    } else if (item.level === "ESCALATE" && item.acting) {
      // "Got it": it's yours now, so it comes off your list. It teaches him nothing.
      out.push(el("button", { class: "btn main wide", type: "button", disabled: state.busy, onclick: () => answer(item, "SEEN") }, "Got it"));
    } else if (item.action === "DRAFT_REPLY") {
      out.push(el("a", { class: "btn main wide", href: `${app}/inbox#${item.id}`, target: "_blank", rel: "noopener" }, "Review draft"));
    } else if (item.thread_id && !item.acting) {
      out.push(el("a", { class: "btn main wide", href: `${app}/review#${item.id}`, target: "_blank", rel: "noopener" }, "Check this call"));
    }
    return out.length ? el("div", { class: "row" }, out) : null;
  }

  function whyList(item) {
    const lines = [...(item.factors ?? [])];
    if (item.safety_rule && !lines.some((f) => f.includes(item.safety_rule))) lines.push(`Safety rule: ${item.safety_rule}`);
    if (item.learned_from) lines.push(`Learned from your answers about this ${item.learned_from}`);
    return lines.length ? el("ul", { class: "why" }, lines.map((f) => el("li", { text: f }))) : el("p", { class: "text", text: item.message });
  }

  function summaryTab(item) {
    const s = STATUS[item.status] ?? STATUS.FYI;
    return [
      el("div", { class: `box ${s.tone}` },
        el("p", { class: "subject", text: item.subject || "(no subject)" }),
        el("p", { class: "text", text: item.summary || item.message })),
      el("div", { class: "box" },
        el("h3", { text: "Oscar recommends" }),
        el("div", { class: "rec" }, icon("pen", 18), recommends(item))),
      // The reply he drafted, as text (it came from the model, so never as HTML). Never sent.
      item.done?.draft && !item.done.undone ? el("div", { class: "box plain" },
        el("h3", { text: "My draft, waiting in Gmail" }),
        el("p", { class: "text ink", style: "white-space: pre-wrap", text: item.done.draft }),
        el("p", { class: "text", text: "Nothing is sent until you send it." })) : null,
      el("button", { class: `state bg-${s.tone} ${s.tone}-t`, type: "button", "aria-expanded": String(state.whyOpen),
        onclick: () => { state.whyOpen = !state.whyOpen; render(); } },
      icon(s.icon, 18), el("span", { text: item.status }), el("i", { class: state.whyOpen ? "open" : "" }, icon("chevron"))),
      state.whyOpen ? el("div", { class: "box plain" }, el("h3", { text: s.why }), whyList(item)) : null,
      mainButtons(item),
    ];
  }

  function actionsTab(item) {
    const done = item.done;
    const by = done?.by === "oscar" ? "me" : "you";
    return [
      el("div", { class: "box" }, el("h3", { text: "What I did" }),
        el("p", { class: "text ink", text: done ? `${didWords(item, done.action)} by ${by} at ${time(done.at)}${done.undone ? ", then undone" : ""}.`
          : item.status === "Stopped" ? "Nothing. I never act on an email I've stopped."
            : item.level === "ESCALATE" ? "Nothing. I left it for you."
            : item.acting ? "Nothing in Gmail yet." : "Nothing. I was only reading your Gmail when this came in." }),
        item.undoable ? el("div", { class: "row" }, el("button", { class: "btn", type: "button", disabled: state.busy,
          onclick: () => answer(item, "UNDO") }, "Undo")) : null),
      el("div", { class: "box" }, el("h3", { text: "What I'd do" }), el("p", { class: "text ink", text: recommends(item) }),
        item.answerable ? el("div", { class: "row" },
          el("button", { class: "btn main", type: "button", disabled: state.busy, onclick: () => answer(item, "APPROVE") }, "Approve"),
          el("button", { class: "btn", type: "button", disabled: state.busy, onclick: () => answer(item, "REJECT") }, "Not this one")) : null),
      // How much to ask next time is its own answer: approving only says the action was right.
      LIKE_THIS_ACTIONS.has(item.action) && item.level !== "ESCALATE" ? el("div", { class: "box" },
        el("h3", { text: "For emails like this" }),
        el("div", { class: "row" },
          el("button", { class: "btn main", type: "button", disabled: state.busy, onclick: () => answer(item, "JUST_HANDLE_IT") }, "Just handle them"),
          el("button", { class: "btn", type: "button", disabled: state.busy, onclick: () => answer(item, "HANDLE_AND_TELL_ME") }, "Handle + tell me"),
          el("button", { class: "btn", type: "button", disabled: state.busy, onclick: () => answer(item, "KEEP_ASKING") }, "Keep asking"))) : null,
      el("div", { class: "box" }, el("h3", { text: "Was that right?" }),
        item.reviewed ? el("p", { class: "text", text: "You've told me about this one. Thank you." }) : rightOrNot(item)),
    ];
  }

  function whyTab(item) {
    const s = STATUS[item.status] ?? STATUS.FYI;
    const app = state.status?.app ?? "http://localhost:3000";
    return [
      el("div", { class: `box ${s.tone}` }, el("div", {}, chip(item.status)), el("p", { class: "text ink", text: item.message })),
      el("div", { class: "box" }, el("h3", { text: s.why }), whyList(item)),
      el("div", {}, el("a", { class: "btn", href: `${app}/review#${item.id}`, target: "_blank", rel: "noopener" }, "See it all in Oscar")),
    ];
  }

  function threadTab() {
    const current = shown();
    return [el("ul", { class: "list" }, (state.thread?.thread ?? []).map((i) => el("li", {},
      el("button", { class: `item${i.id === current?.id ? " on" : ""}`, type: "button",
        onclick: () => { state.focus = i.id; state.tab = "summary"; render(); } },
      el("b", { text: i.subject || "(no subject)" }),
      el("small", {}, chip(i.status), `${address(i.sender)} · ${time(i.received_at)}`)))))];
  }

  function waitingList() {
    const s = state.status;
    const items = s?.waiting ?? [];
    if (!items.length) {
      return [el("div", { class: "box handled" }, el("p", { class: "subject", text: "All caught up" }),
        el("p", { class: "text", text: s?.handled_today ? `I handled ${s.handled_today} today. Nothing needs you.` : "Nothing needs you right now." }))];
    }
    return [el("h3", { text: "Waiting on you" }), el("ul", { class: "list" }, items.map((i) => el("li", {},
      el("button", { class: "item", type: "button", onclick: () => showEmail(i) },
        el("b", { text: i.subject || "(no subject)" }), el("small", {}, chip(i.status), address(i.sender))))))];
  }

  // Closing the panel on an email hides it while you stay there. The next email you open gets it
  // again, and so does this one if you leave it and come back.
  function closePanel() {
    state.open = false;
    state.byHimself = false;
    state.listing = false;
    if (state.visit) state.closed = true;
    render();
  }

  // When the API can't be reached, he says so calmly. He checks again every minute, and whenever
  // you open another email.
  const DOWN = "I can't reach my API right now, so I can't tell you about your emails. Is Oscar running on this computer? I'll keep checking.";
  const trouble = (error) => (/can't reach/i.test(error) ? DOWN : error);

  function panel() {
    const s = state.status;
    const item = state.listing ? null : shown();
    const app = s?.app ?? "http://localhost:3000";
    const TABS = [["summary", "Summary"], ["actions", "Actions"], ["why", "Why?"], ["thread", "Thread"]];
    let body;
    if (state.error) body = [el("p", { class: "said", text: trouble(state.error) })];
    else if (s && !s.connected) body = [el("p", { class: "said" }, "Connect Gmail in Oscar's ", el("a", { href: `${app}/settings`, target: "_blank", rel: "noopener" }, "Settings"), " first.")];
    else if (!item) body = [state.threadId && state.thread && !state.listing ? el("p", { class: "said", text: "I haven't read this one yet." }) : null, ...waitingList()];
    else body = { summary: summaryTab, actions: actionsTab, why: whyTab, thread: threadTab }[state.tab](item);

    const buddy = item ? { Stopped: "guarding", "Needs you": "asking", Handled: "proud", FYI: "alert" }[item.status] ?? "alert"
      : s?.count ? "thinking" : "sleeping";
    return el("section", { class: "panel", role: "dialog", "aria-label": "Oscar", hidden: !state.open },
      el("div", { class: "head" },
        el("img", { src: url("icons/oscar-48.png"), alt: "" }),
        el("p", { class: "name" }, "Oscar", s?.read_only ? el("small", { text: "I only read your Gmail for now" }) : null),
        el("button", { class: "x", type: "button", "aria-label": "Close", onclick: closePanel }, icon("close", 18))),
      item ? el("div", { class: "tabs", role: "tablist" }, TABS.map(([key, words]) =>
        el("button", { class: "tab", type: "button", role: "tab", "aria-selected": String(state.tab === key),
          onclick: () => { state.tab = key; render(); } }, words))) : null,
      el("div", { class: "body" }, state.said ? el("p", { class: "said", role: "status", text: state.said }) : null, body),
      el("img", { class: "buddy", src: mood(buddy), alt: "" }),
      el("div", { class: "foot" }, el("a", { href: `${app}/today`, target: "_blank", rel: "noopener" }, "Open Oscar"),
        el("span", { text: s?.read_only ? "Nothing here changes without you." : "Everything I do can be undone." })));
  }

  // --- Oscar himself, and dragging him -------------------------------------------------------

  let justDragged = false;
  function draggable(peek) {
    // Follow the drag on the whole window: the pointer leaves Oscar as soon as he moves.
    peek.addEventListener("pointerdown", (down) => {
      if (down.button !== 0) return;
      down.preventDefault(); // or the browser starts dragging his picture instead
      const start = { x: down.clientX, left: leftFor(state.spot), moved: false };
      const move = (e) => {
        const dx = e.clientX - start.x;
        if (!start.moved && Math.abs(dx) < 5) return;
        start.moved = true;
        peek.classList.add("dragging");
        state.spot = spotFor(start.left + dx);
        peek.style.left = `${leftFor(state.spot)}px`;
        wrap.querySelector(".note")?.setAttribute("hidden", "");
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (!start.moved) return;
        peek.classList.remove("dragging");
        justDragged = true;
        setTimeout(() => (justDragged = false), 0);
        keep();
        render();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
    peek.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      state.spot = Math.min(1, Math.max(0, state.spot + (e.key === "ArrowLeft" ? -0.1 : 0.1)));
      keep();
      render();
      wrap.querySelector(".peek")?.focus();
    });
  }

  // While the panel is open, Gmail's page is made narrower by the panel's width, so the panel sits
  // beside your email instead of on top of it. Gmail lays itself out again on a resize event. In a
  // narrow window there isn't room for both, so the panel just goes on top as before.
  const ROOM = 388; // the panel's 372px plus its 8px gaps
  let roomMade = false;
  function makeRoom(open) {
    const want = open && window.innerWidth - ROOM >= 900;
    if (want === roomMade) return;
    roomMade = want;
    let style = document.getElementById("oscar-room");
    if (want && !style) {
      style = document.createElement("style");
      style.id = "oscar-room";
      document.head.append(style);
    }
    if (style) style.textContent = want
      ? `html { width: calc(100% - ${ROOM}px) !important; min-width: 0 !important; } body { width: auto !important; min-width: 0 !important; }`
      : "";
    window.dispatchEvent(new Event("resize"));
  }

  function render() {
    if (!alive()) return retire();
    makeRoom(state.open);
    dark = gmailIsDark();
    wrap.classList.toggle("dark", dark);
    const s = state.status;
    const count = s?.count ?? 0;
    const pose = state.card?.kind === "hello" ? hello().pose : state.card ? POSE[state.card.kind] : count ? "thinking" : "sleeping";
    const label = !s ? "Oscar" : count ? `Oscar: ${count} ${count === 1 ? "thing" : "things"} for you` : "Oscar: nothing needs you";
    const peek = el("button", { class: `peek${state.card ? " up" : ""}`, type: "button", hidden: state.open, "aria-expanded": String(state.open),
      "aria-label": `${label}. Drag, or use the arrow keys, to move him.`, style: `left: ${leftFor(state.spot)}px`,
      onclick: () => {
        if (justDragged) return;
        if (["attention", "idle", "hello"].includes(state.card?.kind)) dismiss();
        state.open = true;
        state.byHimself = false;
        state.said = null;
        render();
        refresh();
      } },
    el("img", { src: mood(pose), alt: "", draggable: "false" }), count ? el("span", { class: "badge", text: count > 99 ? "99+" : String(count) }) : null);
    draggable(peek);
    const companion = { show: true, animate: true, ...(s?.settings?.companion ?? {}) };
    wrap.classList.toggle("still", !companion.animate);
    // "Show Oscar in Gmail" off: no Oscar in the corner, no cards, and the panel doesn't open by
    // itself (load, above). The chips and labels on your emails stay.
    wrap.replaceChildren(...(companion.show ? [peek, card() ?? ""] : []), panel());
  }

  // One look at a time. Asked again mid-look (you opened another email meanwhile), he looks once
  // more straight after, so the change isn't missed.
  let refreshing = null, again = false;
  function refresh() {
    if (!alive()) return Promise.resolve(retire());
    if (!loaded) return Promise.resolve();
    if (refreshing) {
      again = true;
      return refreshing;
    }
    refreshing = load().finally(() => {
      refreshing = null;
      if (again) {
        again = false;
        refresh();
      }
    });
    return refreshing;
  }

  // Gmail puts an email's address up before the email itself, and can be slow to. He looks again
  // every 300ms, for up to 5 seconds, then opens the panel anyway.
  let looking = null, waitedFor = null;
  function lookAgain(visit) {
    if (looking) return;
    let tries = 0;
    looking = setInterval(() => {
      const here = where();
      if (here.thread || here.visit !== visit || ++tries >= 16) {
        clearInterval(looking);
        looking = null;
        if (!here.thread && here.visit === visit) waitedFor = visit;
        refresh();
      }
    }, 300);
  }
  let greeted = false; // the hello, once a page load

  async function load() {
    const status = await ask({ type: "status" });
    state.status = status.ok ? status.data : state.status;
    state.error = status.ok ? null : status.error;
    // Which side he starts on, from Oscar's Settings. He only moves when that setting changes, so
    // otherwise he stays wherever you last dragged him.
    const position = status.ok ? status.data.settings?.companion?.position : null;
    if (position && memory.position !== position) {
      state.spot = position === "left" ? 0 : 1;
      memory.position = position;
      keep();
    }
    if (status.ok && !memory.started) {
      // The first time: everything already there counts as seen, so you aren't flooded with cards.
      for (const i of [...status.data.waiting, ...(status.data.recent ?? [])]) markSeen(i.id);
      memory.started = true;
      keep();
    }
    const here = where();
    const thread = here.thread;
    if (here.visit !== state.visit) {
      // You opened an email, another one, or went back to your list.
      state.visit = here.visit;
      state.closed = false;
      state.listing = false;
      waitedFor = null;
      // Back in your list, a panel he opened by himself goes away again.
      if (!here.visit && state.byHimself) {
        state.open = false;
        state.byHimself = false;
      }
    }
    if (thread !== state.threadId) {
      // Gmail opened another email: the one you picked, or one you clicked yourself.
      if (thread !== state.pinned?.thread_id) state.focus = null;
      state.pinned = null;
    }
    // Opening an email opens his panel beside it, every time, unless you closed it on this one or
    // turned him off in Oscar's Settings. That includes when he can't reach his API or Gmail isn't
    // connected: the panel then says so. He waits for Gmail to show the email first (lookAgain).
    const show = (status.ok ? status.data : state.status)?.settings?.companion?.show ?? true;
    if (here.visit && show && !state.open && !state.closed) {
      if (thread || waitedFor === here.visit) {
        state.open = true;
        state.byHimself = true;
        state.tab = "summary";
      } else {
        lookAgain(here.visit);
      }
    }
    state.threadId = thread;
    if (thread && status.ok) {
      const found = await ask({ type: "thread", id: thread });
      state.thread = found.ok ? found.data : null;
      if (where().thread !== thread) again = true; // you moved on while he asked: look again
    } else {
      state.thread = null;
    }
    // Hello when Gmail opens (once a page load), unless his panel is already open on an email.
    if (!greeted) {
      greeted = true;
      if (show && !here.visit && !state.open && helloWorth()) {
        state.card = { kind: "hello" };
        fadeHello();
      }
    }
    if (!["feedback", "hello"].includes(state.card?.kind) && !state.said) state.card = nextCard();
    chips.clear();
    paintRows();
    render();
  }

  // --- chips in Gmail's list -----------------------------------------------------------------

  const CHIP_CSS = `:host { all: initial; display: inline-flex; vertical-align: middle; margin-right: 8px; }
    ${TOKENS.replaceAll(".wrap", ".c")}
    .c { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px 2px 7px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
         white-space: nowrap; line-height: 18px; font-family: "Google Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
    .handled { background: var(--handled-bg); color: var(--handled); } .fyi { background: var(--fyi-bg); color: var(--fyi); }
    .needs { background: var(--needs-bg); color: var(--needs); } .blocked { background: var(--blocked-bg); color: var(--blocked); }`;
  const chips = new Map(); // thread id -> his call, refreshed with the status
  const painted = new WeakMap(); // Gmail's row -> { host, status }
  let fetching = false;

  async function paintRows() {
    if (!alive()) return retire();
    const rows = [...document.querySelectorAll("tr.zA")];
    const wanted = [...new Set(rows.map(threadOf).filter((id) => id && !chips.has(id)))].slice(0, 100);
    if (wanted.length && !fetching && state.status?.connected) {
      fetching = true;
      const reply = await ask({ type: "threads", ids: wanted });
      fetching = false;
      if (reply.ok) for (const id of wanted) chips.set(id, reply.data[id] ?? null);
    }
    for (const row of rows) {
      const id = threadOf(row);
      if (!chips.has(id)) continue; // not asked about yet: leave the row as it is
      const status = STATUS[chips.get(id)] ? chips.get(id) : null;
      const had = painted.get(row);
      if (had?.status !== status || (had.host && !had.host.isConnected)) {
        had?.host?.remove();
        const spot = row.querySelector(".xT") ?? row.querySelector("[data-legacy-thread-id], [data-thread-id]")?.closest("td");
        let chipHost = null;
        if (status && spot) {
          const s = STATUS[status];
          chipHost = el("span", { "data-oscar-chip": "" });
          chipHost.attachShadow({ mode: "closed" }).append(el("style", { text: CHIP_CSS }),
            el("span", { class: `c ${s.tone}${dark ? " dark" : ""}`, title: `Oscar: ${status}` }, icon(s.icon, 12), status));
          spot.prepend(chipHost);
        }
        painted.set(row, { host: chipHost, status });
      }
      // Gmail shows his status label on the row too, and the chip says the same, so Gmail's copy is
      // hidden here. The labels can be renamed in Settings, so it's matched by the chip names and
      // by the names in Settings.
      if (status) {
        const labels = state.status?.settings?.labels ?? {};
        const his = new Set([...Object.keys(STATUS), labels.stopped, labels.needs_you, labels.fyi].filter(Boolean).map((n) => n.toLowerCase()));
        for (const tag of row.querySelectorAll(".ar.as, .at")) {
          const name = (tag.getAttribute("title") ?? tag.textContent ?? "").trim();
          if (his.has(name.toLowerCase())) {
            const label = tag.closest(".ar") ?? tag;
            label.style.display = "none";
            label.dataset.oscarHid = "";
          }
        }
      }
    }
  }

  let soon = null;
  const watcher = new MutationObserver(() => {
    clearTimeout(soon);
    soon = setTimeout(paintRows, 400);
  });
  watcher.observe(document.body, { childList: true, subtree: true });

  // The open email changes without a page load: watch the address, and check the page now and then.
  // The check compares with the email he last looked at, so a change he missed mid-load is caught next time.
  // Every time the address moves to another email, or off one, it counts as a new visit, however
  // quickly you come back: so opening the same email again opens the panel again.
  let lastHash = hashEmail();
  const onHash = () => {
    const id = hashEmail();
    if (id !== lastHash) {
      lastHash = id;
      state.visit = undefined;
    }
    setTimeout(refresh, 300);
  };
  const onResize = () => render();
  window.addEventListener("hashchange", onHash);
  window.addEventListener("resize", onResize);
  // Escape closes the panel when you're in it; anywhere else it's Gmail's.
  host.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) closePanel();
  });
  const watching = setInterval(() => {
    const here = where();
    if (here.visit !== state.visit || here.thread !== state.threadId) refresh();
  }, 1500);
  const checking = setInterval(refresh, 60_000);

  // A last net under alive(): if anything in this copy still reaches Chrome after the extension was
  // reloaded, it retires quietly instead of filling the extension's error page.
  const invalidated = (error) => /extension context invalidated/i.test(String(error?.message ?? error ?? ""));
  window.addEventListener("error", (e) => {
    if (invalidated(e.error ?? e.message)) {
      e.preventDefault();
      retire();
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (invalidated(e.reason)) {
      e.preventDefault();
      retire();
    }
  });

  // This copy can't reach Chrome any more: stop everything and take Oscar and the chips off the page.
  let retired = false;
  function retire() {
    if (retired) return;
    retired = true;
    watcher.disconnect();
    clearTimeout(soon);
    clearInterval(watching);
    clearInterval(checking);
    clearInterval(looking);
    clearTimeout(helloTimer);
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("resize", onResize);
    host.remove();
    document.getElementById("oscar-room")?.remove(); // Gmail gets its full width back
    window.dispatchEvent(new Event("resize"));
    for (const chip of document.querySelectorAll("[data-oscar-chip]")) chip.remove();
    for (const label of document.querySelectorAll("[data-oscar-hid]")) {
      label.style.display = "";
      delete label.dataset.oscarHid;
    }
  }

  render();
})();
