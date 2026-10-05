"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CLOSING, STEPS, beforeOf, live, type Side, type TourAction, type TourCtx } from "@/components/demo/tour-steps";
import { LevelDot } from "@/components/kit/status";
import { OscarMood, type OscarPose } from "@/components/oscar-mood";
import { Button } from "@/components/ui/button";
import type { Level } from "@/lib/api";
import { useChat } from "@/lib/chat-store";
import { STATUS } from "@/lib/labels";
import { useLocalSetting, writeSetting } from "@/lib/local-setting";
import { setHash, useHash } from "@/lib/use-hash";
import { firstName, saveDemoName, useDemoName } from "@/lib/demo-name";
import { notifyChanged, useDemoSession, useOscar, type OscarData } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

/**
 * Where the tour keeps its place in this browser: "<demo id>:<step id>", "offer" or "off". A new
 * demo starts with the offer again.
 */
const TOUR_KEY = "demo-tour";

/** The step between how Oscar learns and the rest of the app, which the tour now passes straight through. */
const END = STEPS.findIndex((s) => s.id === CLOSING);

/** The banner's Tour button: back to the first step. */
export const startTour = (session: string) => writeSetting(TOUR_KEY, `${session}:${STEPS[0].id}`);
/** Reset demo: the tour offers itself again. */
export const forgetTour = () => writeSetting(TOUR_KEY, null);

const LOST_MS = 2000; // a target that hasn't shown up by then: Oscar talks from the middle instead
const GAP = 26; // between what he points at and him, with the arrow in it
const EDGE = 12; // he always stays this far inside the screen
const PAD = 6; // the ring around what he points at
const ARROW = 16;
const TAP = "h-9 rounded-full px-4 text-[13px] font-semibold";
const TOP_BAR = 64; // the phone's header, with a little room under it
const BACK_MS = 1500; // after his answer in Chat, before the tour comes back
const GIVE_UP_MS = 30000; // no answer by then: the tour comes back anyway
// Another window over the app (the Why drawer, the phone's More menu): the tour steps aside for it.
const OTHER_DIALOG = '[role="dialog"][aria-modal="true"]';
// ...and for an open menu (Change, Make it a rule, the Inbox's pills), which sits below the dim.
const COVERING = `${OTHER_DIALOG}, [role="menu"][data-state="open"]`;

// Whether Oscar's bubble is on screen, so toasts can keep out of its way (components/toasts.tsx).
let bubbleShown = false;
const bubbleListeners = new Set<() => void>();
function showBubble(on: boolean) {
  bubbleShown = on;
  bubbleListeners.forEach((l) => l());
}
export function useTourBubble() {
  return useSyncExternalStore(
    (onChange) => {
      bubbleListeners.add(onChange);
      return () => bubbleListeners.delete(onChange);
    },
    () => bubbleShown,
    () => false,
  );
}

const MEANS: Record<Level, string> = {
  PROCEED_SILENTLY: "I did it.",
  PROCEED_AND_NOTIFY: "I did it, and told you.",
  ASK_FIRST: "I'm waiting for your yes.",
  ESCALATE: "Something's off, so I won't touch it.",
};

export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The demo tour: Oscar shows you how he learns, on three emails, moving to each thing the tour
 * talks about and pointing at it. Then a closing card, and on through the rest of the app, where
 * you answer one of his calls in Review and ask him something in Chat. Only in demo mode. A fresh
 * demo starts with an offer in the middle of the screen; after that it's one step at a time, and
 * you can leave it at any point. It never blocks the app: the dimmed screen lets every click through.
 */
export function DemoTour() {
  const session = useDemoSession();
  const { data } = useOscar();
  const [saved, setSaved] = useLocalSetting<string>(TOUR_KEY, "");
  const name = useDemoName(session);
  const [typed, setTyped] = useState("");
  // Not while the demo inbox is still starting.
  if (!session || !data?.all.length) return null;

  const [id, place] = saved.split(":");
  const state = id === session ? place : "offer";
  const go = (next: string) => setSaved(`${session}:${next}`);
  if (state === "off") return null;
  const close = () => go("off");
  // Before the offer, your name, so the demo emails can greet you (lib/demo-name.ts).
  const keepName = (given: string) => {
    saveDemoName(session, given);
    notifyChanged();
  };
  if (state === "offer" && name === null)
    return (
      <Card
        pose="asking"
        title="Hi! What should I call you?"
        main="Continue"
        other="Skip"
        field={{ value: typed, onChange: setTyped, label: "Your name", placeholder: "Your name" }}
        onMain={() => keepName(typed)}
        onOther={() => keepName("")}
        onClose={() => keepName("")}
      />
    );
  if (state === "offer")
    return (
      <Card
        pose="asking"
        title={name ? `Hi ${firstName(name)}! Want to see how Oscar learns?` : "Want to see how Oscar learns?"}
        text="See it in about a minute."
        main="Start demo"
        onMain={() => go(STEPS[0].id)}
        onClose={close}
      />
    );

  const index = Math.max(0, STEPS.findIndex((s) => s.id === state));
  // No stop between how Oscar learns and the rest of the app: the tour carries straight on.
  if (index === END) return <CarryOn go={() => go(STEPS[END + 1].id)} />;
  return <Tour index={index} data={data} go={go} />;
}

/** The step before this one, passing over the step between the two parts (it only moves on). */
const back = (index: number) => (index - 1 === END ? index - 2 : index - 1);

/** Moves the tour on as soon as it's shown. */
function CarryOn({ go }: { go: () => void }) {
  useEffect(() => {
    go();
  }, [go]);
  return null;
}

/**
 * A card in the middle of the screen with two choices: asking your name, the offer when a demo
 * starts, and the closing card after the learning part. Esc closes the tour (or skips the name).
 */
function Card(props: {
  pose: OscarPose;
  title: string;
  text?: string;
  main: string;
  other?: string;
  /** A box to type in, above the choices. Enter picks the main one. */
  field?: { value: string; onChange: (value: string) => void; label: string; placeholder: string };
  onMain: () => void;
  onOther?: () => void;
  onClose: () => void;
}) {
  const { pose, title, text, main, other, field, onMain, onOther, onClose } = props;
  const first = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useEffect(() => {
    (input.current ?? first.current)?.focus({ preventScroll: true });
  }, [title]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(OTHER_DIALOG) && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] bg-black/30 animate-in fade-in-0 dark:bg-black/55" />
      <div className="pointer-events-none fixed inset-0 z-[62] flex items-center justify-center p-4">
        <div
          key={title}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border bg-card px-6 py-7 text-center shadow-card animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
        >
          <OscarMood pose={pose} size={128} className="size-28 sm:size-32" />
          <div className="flex flex-col gap-1.5">
            <h2 id={titleId} className={cn("font-extrabold tracking-[-0.02em] text-balance", text ? "text-2xl" : "text-xl leading-snug")}>
              {title}
            </h2>
            {text && <p className="text-[15px] leading-snug text-muted-foreground">{text}</p>}
          </div>
          <form
            className="flex w-full flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              onMain();
            }}
          >
            {field && (
              <input
                ref={input}
                type="text"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                aria-label={field.label}
                placeholder={field.placeholder}
                maxLength={40}
                autoComplete="name"
                className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-center text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            )}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button ref={first} type="submit" className="h-11 rounded-full px-5 font-semibold">
                {main}
              </Button>
              {other && (
                <Button type="button" variant="ghost" className="h-11 rounded-full px-5" onClick={onOther}>
                  {other}
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

type Box = { x: number; y: number; w: number; h: number };
type Dir = "left" | "right" | "up" | "down";

/**
 * What's on screen right now: the target (padded for the ring), the screen, where the phone's tabs
 * start (`floor`, the screen's bottom elsewhere), and Oscar's own size.
 */
type Geo = { key: string; target: Box | null; clear: Box[]; lost: boolean; covered: boolean; vw: number; vh: number; floor: number; unit: Box };

const boxOf = (r: DOMRect, pad = 0): Box => ({
  x: Math.round(r.left - pad),
  y: Math.round(r.top - pad),
  w: Math.round(r.width + pad * 2),
  h: Math.round(r.height + pad * 2),
});
const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
const sameGeo = (a: Geo, b: Geo) =>
  a.key === b.key && a.lost === b.lost && a.covered === b.covered && a.vw === b.vw && a.vh === b.vh && a.floor === b.floor && sameBox(a.target, b.target) && sameBox(a.unit, b.unit) &&
  a.clear.length === b.clear.length && a.clear.every((box, i) => sameBox(box, b.clear[i]));
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The part of a box that's on screen, so he points at what you can see of something tall. */
function onScreen(t: Box, vw: number, vh: number): Box {
  const x = Math.max(t.x, 0);
  const y = Math.max(t.y, 0);
  const w = Math.min(t.x + t.w, vw) - x;
  const h = Math.min(t.y + t.h, vh) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : t;
}

/** The first of these data-tour names that's on screen (a page can keep hidden copies, like the phone's tabs). */
function findTarget(names: string[]) {
  for (const name of names) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** Pinned in place (the sidebar, the phone's tabs, the chat box): scrolling never moves it. */
function pinned(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const { position } = getComputedStyle(n);
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/**
 * Scrolls the target into view when it's off screen or cut off: to the middle of the screen, or on
 * a phone to the middle of the room between the header and Oscar (`top` to `bottom`). Something
 * taller than that only moves when its top is hidden.
 */
function bringIntoView(el: HTMLElement, phone: boolean, top: number, bottom: number, still: boolean) {
  if (pinned(el)) return;
  const r = el.getBoundingClientRect();
  const room = bottom - top;
  const fits = r.height <= room;
  const cut = fits ? r.bottom > bottom : r.top > top + room / 2;
  if (r.top >= top && !cut && r.left >= 0 && r.right <= window.innerWidth) return;
  const behavior = still ? "auto" : "smooth";
  if (phone) window.scrollBy({ top: r.top - top - (fits ? (room - r.height) / 2 : 0), behavior });
  else el.scrollIntoView({ block: r.height > room * 0.6 ? "start" : "center", inline: "nearest", behavior });
}

/**
 * Where Oscar stands: on the step's own side when he fits there, otherwise the side with the most
 * room for him. Either way not over anything in `clear` (what the step is about) when another side
 * keeps him off it. Always fully on screen.
 */
function placeBeside(t: Box | null, vw: number, vh: number, w: number, h: number, prefer?: Side, clear: Box[] = []): { x: number; y: number; side: Side | null } {
  if (!t) return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), side: null };
  const room: Record<Side, number> = { right: vw - t.x - t.w, left: t.x, below: vh - t.y - t.h, above: t.y };
  const need: Record<Side, number> = { right: w + GAP + EDGE, left: w + GAP + EDGE, below: h + GAP + EDGE, above: h + GAP + EDGE };
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const spot = (side: Side) => {
    const at = {
      right: [t.x + t.w + GAP, cy - h / 2],
      left: [t.x - GAP - w, cy - h / 2],
      below: [cx - w / 2, t.y + t.h + GAP],
      above: [cx - w / 2, t.y - GAP - h],
    }[side];
    return { x: Math.round(clamp(at[0], EDGE, vw - w - EDGE)), y: Math.round(clamp(at[1], EDGE, vh - h - EDGE)), side };
  };
  const covers = (p: { x: number; y: number }) => clear.some((b) => p.x < b.x + b.w && p.x + w > b.x && p.y < b.y + b.h && p.y + h > b.y);
  // The step's own side first, then the others, the roomiest first.
  const sides = (["right", "left", "below", "above"] as Side[]).sort((a, b) => room[b] / need[b] - room[a] / need[a]);
  const order = prefer ? [prefer, ...sides.filter((s) => s !== prefer)] : sides;
  const fits = order.filter((s) => room[s] >= need[s]);
  for (const s of fits) {
    const p = spot(s);
    if (!covers(p)) return p;
  }
  return spot(fits[0] ?? sides[0]);
}

/** Along one edge: the middle of where the target and Oscar overlap, or as near the target as he reaches. */
function along(centre: number, t0: number, t1: number, u0: number, u1: number) {
  const m = ARROW;
  const lo = Math.max(t0, u0) + m;
  const hi = Math.min(t1, u1) - m;
  return lo <= hi ? clamp(centre, lo, hi) : clamp(centre, u0 + m, u1 - m);
}

/** The arrow between Oscar and the target, its tip just outside the ring. Top-left corner and direction. */
function arrowFor(t: Box, u: Box, side: Side): { x: number; y: number; dir: Dir } {
  const half = ARROW / 2;
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  if (side === "right") return { x: t.x + t.w + 4, y: along(cy, t.y, t.y + t.h, u.y, u.y + u.h) - half, dir: "left" };
  if (side === "left") return { x: t.x - 4 - ARROW, y: along(cy, t.y, t.y + t.h, u.y, u.y + u.h) - half, dir: "right" };
  if (side === "below") return { x: along(cx, t.x, t.x + t.w, u.x, u.x + u.w) - half, y: t.y + t.h + 4, dir: "up" };
  return { x: along(cx, t.x, t.x + t.w, u.x, u.x + u.w) - half, y: t.y - 4 - ARROW, dir: "down" };
}

const CLIP: Record<Dir, string> = {
  left: "polygon(0 50%, 100% 0, 100% 100%)",
  right: "polygon(100% 50%, 0 0, 0 100%)",
  up: "polygon(50% 0, 100% 100%, 0 100%)",
  down: "polygon(50% 100%, 0 0, 100% 0)",
};

function Tour({ index, data, go }: { index: number; data: OscarData; go: (next: string) => void }) {
  const step = STEPS[index];
  const router = useRouter();
  const hash = useHash();
  const phone = useMedia("(max-width: 767px)");
  const narrow = useMedia("(max-width: 1023px)");
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const { messages } = useChat();
  // What you'd done when this step started, so a step you do yourself can tell what's new.
  const [start, setStart] = useState(() => ({ index, before: beforeOf(data, messages) }));
  if (start.index !== index) setStart({ index, before: beforeOf(data, messages) });
  const c: TourCtx = { data, hash, narrow, chat: messages, before: start.before };

  // A step that steps aside (Chat) hides the tour from your question until a moment after his
  // answer, so you see the whole chat. `caught` is how much of the chat the tour has let go by.
  const [caught, setCaught] = useState({ index, n: messages.length });
  if (caught.index !== index) setCaught({ index, n: messages.length });
  const away = !!step.stepAside && caught.index === index && messages.length > caught.n;
  const answered = messages.at(-1)?.from === "oscar";
  useEffect(() => {
    if (!away) return;
    // If he never answers, it comes back anyway, and doesn't hide again when he finally does.
    const n = answered ? messages.length : messages.length + 1;
    const t = setTimeout(() => setCaught({ index, n }), answered ? BACK_MS : GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [away, answered, index, messages.length]);

  const names = step.centre ? "" : (live(step.target, c) ?? []).join(" ");
  const clearNames = step.centre ? "" : (step.clear ?? []).join(" ");
  const where = live(step.where, c);
  const done = !step.waitFor || step.waitFor.done(c);
  const action = live(step.action, c);
  const last = index === STEPS.length - 1;
  const key = `${step.id}|${names}`;

  const unitRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const textId = useId();
  const outcomeId = useId();

  const move = (to: number) => to >= 0 && to < STEPS.length && go(STEPS[to].id);
  const close = () => go("off");

  useEffect(() => {
    showBubble(true);
    return () => showBubble(false);
  }, []);

  // Each step opens its page (and its email). Only when the step starts, or the email it's about
  // changes, so it never pulls you back from wherever you've wandered.
  const path = where?.path;
  const wantHash = where?.hash;
  useEffect(() => {
    if (!path) return;
    if (window.location.pathname !== path) router.push(wantHash ? `${path}#${wantHash}` : path);
    else if (wantHash !== undefined && window.location.hash.slice(1) !== wantHash) setHash(wantHash);
  }, [index, path, wantHash, router]);

  // A step you do yourself, like opening an email, moves on by itself once you've done it. Only
  // when it happens on this step, so Back can still return to it.
  const seen = useRef({ index, done });
  useEffect(() => {
    const before = seen.current;
    seen.current = { index, done };
    if (before.index === index && !before.done && done && step.waitFor?.advance) go(STEPS[index + 1].id);
  });

  // Find what he points at, bring it into view if it's off screen, and follow it as the page
  // scrolls, resizes or changes. A short poll covers what no event announces (a row appearing after
  // new mail, a new page arriving). After LOST_MS without it, he talks from the middle instead.
  useEffect(() => {
    const list = names ? names.split(" ") : [];
    const keepClear = clearNames ? clearNames.split(" ") : [];
    let started = 0;
    let shown: HTMLElement | null = null; // the element brought into view, so each one only scrolls once
    let frame = 0;
    const measure = (now: number) => {
      frame = 0;
      started ||= now;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tabs = phone ? document.querySelector('nav[aria-label="Main"]')?.getBoundingClientRect() : null;
      const floor = tabs?.height ? Math.round(tabs.top) : vh;
      const el = findTarget(list);
      const u = unitRef.current?.getBoundingClientRect();
      const unit = u ? (phone ? boxOf(u) : { x: 0, y: 0, w: Math.round(u.width), h: Math.round(u.height) }) : { x: 0, y: 0, w: 0, h: 0 };
      if (el && el !== shown) {
        shown = el;
        // On a phone, clear of the header, and of Oscar docked above the tabs with his arrow.
        if (phone) bringIntoView(el, true, TOP_BAR, floor - 12 - unit.h - ARROW - 4, still);
        else bringIntoView(el, false, 0, vh, still);
      }
      const lost = !el && list.length > 0 && now - started > LOST_MS;
      const covered = !!document.querySelector(COVERING);
      const clear = keepClear.flatMap((name) => {
        const near = findTarget([name]);
        return near && near !== el ? [boxOf(near.getBoundingClientRect())] : [];
      });
      setGeo((prev) => {
        // Still looking (the new page is on its way): he stays with the last thing he pointed at.
        const looking = !el && list.length > 0 && !lost && prev;
        const next: Geo = looking
          ? { ...prev, covered, vw, vh, floor, unit }
          : { key, target: el ? boxOf(el.getBoundingClientRect(), PAD) : null, clear, lost, covered, vw, vh, floor, unit };
        return prev && sameGeo(prev, next) ? prev : next;
      });
    };
    const soon = () => {
      frame ||= requestAnimationFrame(measure);
    };
    soon();
    const poll = setInterval(soon, 250);
    const resized = new ResizeObserver(soon);
    if (unitRef.current) resized.observe(unitRef.current);
    window.addEventListener("scroll", soon, { capture: true, passive: true });
    window.addEventListener("resize", soon);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(poll);
      resized.disconnect();
      window.removeEventListener("scroll", soon, { capture: true });
      window.removeEventListener("resize", soon);
    };
  }, [key, names, clearNames, phone, still]);

  // Esc closes the tour; the arrow keys move through it while you're on it.
  const canNext = done && !last;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || document.querySelector(OTHER_DIALOG)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=menu]")) return;
      if (e.key === "Escape") return go("off");
      const onTour = !target || target === document.body || !!bubbleRef.current?.contains(target);
      if (!onTour) return;
      if (e.key === "ArrowRight" && canNext) go(STEPS[index + 1].id);
      else if (e.key === "ArrowLeft" && index > 0) go(STEPS[back(index)].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, canNext, go]);

  async function run(a: TourAction) {
    setBusy(true);
    try {
      const next = await a.run();
      if (next) go(next);
    } finally {
      setBusy(false);
    }
  }

  // While a new target is still being found, he stays where he was, without an arrow.
  const ready = !!geo && geo.key === key;
  const target = geo && !geo.lost ? geo.target : null;
  const covered = !!geo?.covered || away;
  const showing = !!geo && !covered;
  // Each step puts focus on what he says, once he's on screen, so a keyboard or screen reader
  // follows along. Not while you're typing somewhere in the app.
  const focused = useRef(-1);
  useEffect(() => {
    if (!showing || focused.current === index) return;
    focused.current = index;
    if (document.activeElement?.closest("input, textarea, select, [contenteditable]")) return;
    bubbleRef.current?.focus({ preventScroll: true });
  }, [index, showing]);

  // On a phone the tabs cover the bottom of the screen, so he only points at what's above them.
  const visible = target && geo ? onScreen(target, geo.vw, phone ? geo.floor : geo.vh) : null;
  const spot = geo ? placeBeside(visible, geo.vw, geo.vh, geo.unit.w, geo.unit.h, step.side, geo.clear) : null;
  const unitBox = geo && spot ? (phone ? geo.unit : { x: spot.x, y: spot.y, w: geo.unit.w, h: geo.unit.h }) : null;
  const arrow =
    ready && visible && unitBox
      ? phone
        ? {
            x: clamp(visible.x + visible.w / 2, unitBox.x + 24, unitBox.x + unitBox.w - 24) - ARROW / 2,
            ...(visible.y + visible.h / 2 < unitBox.y
              ? { y: unitBox.y - ARROW - 2, dir: "up" as Dir }
              : { y: unitBox.y + unitBox.h + 2, dir: "down" as Dir }),
          }
        : spot?.side
          ? arrowFor(visible, unitBox, spot.side)
          : null
      : null;
  // On a phone he docks above the tabs. When what he points at is down there too (the chat box), he
  // stands just above it instead, or at the top when there's no room for that.
  const dockTop = geo ? geo.floor - 12 - geo.unit.h : 0;
  const lift = phone && target && geo && target.y + PAD > dockTop - 12 && target.y + PAD < geo.floor - 4 ? target.y - ARROW - 4 : null;
  const high = lift !== null && !!geo && lift - geo.unit.h < TOP_BAR;
  // Oscar on the side nearest the target; in the middle, he stands above what he says.
  const layout = phone ? "row" : !target ? "centre" : spot?.side === "left" ? "reverse" : "row";
  const text = live(step.text, c);
  const outcome = live(step.outcome, c);
  // Focus reads a step's words when it starts. Words that change while you're on it (what came of
  // your answer, or of the new email) are read out here instead.
  const said = outcome ? `${text} ${outcome}` : text;
  const [opening, setOpening] = useState({ index, said });
  if (opening.index !== index) setOpening({ index, said });
  const changed = opening.index === index && opening.said !== said ? (outcome ?? text) : "";
  const motion = "transition-[transform,opacity,width,height] duration-500 ease-out motion-reduce:transition-none";

  return (
    <>
      {/* The dim, with a lit-up ring around the target. It lets every click through to the app. */}
      <div
        aria-hidden
        className={cn("pointer-events-none fixed inset-0 z-[60] [--tour-dim:rgb(0_0_0/0.3)] dark:[--tour-dim:rgb(0_0_0/0.55)]", covered && "invisible")}
      >
        <div className={cn("absolute inset-0 bg-(--tour-dim) transition-opacity duration-300", target ? "opacity-0" : "opacity-100")} />
        {target && (
          <div
            className={cn("absolute top-0 left-0 rounded-[14px]", motion)}
            style={{
              transform: `translate(${target.x}px, ${target.y}px)`,
              width: target.w,
              height: target.h,
              boxShadow: "0 0 0 3px var(--level-notify), 0 0 0 9999px var(--tour-dim)",
            }}
          />
        )}
      </div>

      {arrow && (
        <div
          aria-hidden
          className={cn("pointer-events-none fixed top-0 left-0 z-[62] bg-level-notify", motion, covered && "invisible")}
          style={{ width: ARROW, height: ARROW, transform: `translate(${arrow.x}px, ${arrow.y}px)`, clipPath: CLIP[arrow.dir] }}
        />
      )}

      <p aria-live="polite" className="sr-only">
        {changed}
      </p>

      {/* Only the bubble takes clicks; the space around Oscar lets them through to the app. */}
      <div
        ref={unitRef}
        className={cn(
          "pointer-events-none fixed z-[62] flex gap-2",
          // On a phone he docks at the bottom, just above the tabs, clear of the header and the banner.
          phone && lift === null && "inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] items-end",
          lift !== null && !high && "inset-x-3 items-end",
          high && "inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] items-start",
          !phone && cn("top-0 left-0", motion),
          layout === "centre" && "flex-col items-center gap-3",
          layout === "reverse" && "flex-row-reverse",
          // He stands level with the near edge of the bubble, close to what he points at.
          !phone && layout !== "centre" && (spot?.side === "above" ? "items-end" : "items-start"),
          // All at once: the buttons inside would otherwise fade out on their own.
          (!geo || covered) && "invisible **:transition-none",
        )}
        style={
          phone
            ? lift !== null && !high && geo
              ? { bottom: geo.vh - lift }
              : undefined
            : spot
              ? { transform: `translate(${spot.x}px, ${spot.y}px)` }
              : undefined
        }
      >
        <OscarMood
          pose={live(step.pose, c)}
          size={layout === "centre" ? 112 : 84}
          className={cn(layout === "centre" ? "size-28" : "size-14 md:size-20", "drop-shadow-sm")}
        />
        <div
          ref={bubbleRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={outcome ? `${textId} ${outcomeId}` : textId}
          tabIndex={-1}
          className={cn(
            "pointer-events-auto relative flex flex-col gap-2.5 rounded-2xl border bg-card p-4 shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            phone ? "min-w-0 flex-1" : "w-[20rem]",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {/* One count for the whole tour; the step between the two parts is skipped. */}
              {`${index < END ? index + 1 : index} of ${STEPS.length - 1}`}
            </span>
            {!last && (
              <button
                type="button"
                onClick={close}
                className="-my-2 -mr-2 min-h-9 rounded-full px-2.5 text-xs font-semibold text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                Explore on my own
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-[15px] font-bold">
              {step.title}
            </h2>
            <p id={textId} className="text-sm leading-snug">
              {text}
            </p>
          </div>
          {outcome && (
            <p id={outcomeId} className="text-sm leading-snug font-semibold">
              {outcome}
            </p>
          )}
          {step.levels && (
            <ul className="flex flex-col gap-1.5 text-[13px] leading-snug">
              {(Object.keys(MEANS) as Level[]).map((level) => (
                <li key={level} className="flex items-baseline gap-2">
                  <LevelDot level={level} className="translate-y-[-1px]" />
                  <span>
                    <b className="font-semibold">{STATUS[level].label}:</b> <span className="text-muted-foreground">{MEANS[level]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {action && (
            <Button variant="outline" className={cn(TAP, "self-start")} disabled={busy} onClick={() => void run(action)}>
              {action.label}
            </Button>
          )}
          {!done && step.waitFor && (
            <p className="text-[13px] text-muted-foreground">
              {live(step.waitFor.hint, c)}{" "}
              <button type="button" onClick={() => move(index + 1)} className="font-semibold text-foreground underline underline-offset-4">
                Skip this
              </button>
            </p>
          )}
          {last && <p className="text-[13px] text-muted-foreground">Tour, at the top, shows you around again, and Reset demo starts it all over.</p>}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <Button variant="ghost" className={cn(TAP, "-ml-2 px-3")} disabled={index === 0} onClick={() => move(back(index))}>
              Back
            </Button>
            {last ? (
              <Button className={TAP} onClick={close}>
                Explore on my own
              </Button>
            ) : (
              done && (
                <Button className={TAP} onClick={() => move(index + 1)}>
                  Next
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
