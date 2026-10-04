// Numbers and lists the pages show, worked out from Oscar's real decisions. Nothing here is
// estimated: if there isn't enough data for something, it returns null or an empty list and the
// page says so instead of showing a made-up number.

import type { Decision, DecisionWithFeedback } from "@/lib/api";
import { DOABLE, KIND_NAMES, riskOf } from "@/lib/labels";

/** When the email arrived, or when Oscar read it for emails that don't say. */
export const timeOf = (i: DecisionWithFeedback) => i.decision.gmail?.received_at ?? i.decision.created_at;

const ACTED = new Set(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"]);
const ASKED = new Set(["ASK_FIRST", "ESCALATE"]);

/** Items within the last `days` days (by when the email arrived). */
export function within(items: DecisionWithFeedback[], days: number, now = Date.now()) {
  return items.filter((i) => now - new Date(timeOf(i)).getTime() <= days * 86_400_000);
}

/**
 * How often Oscar asked you, over time: the decisions in order, split into `windows` equal parts,
 * with the share in each that he asked about or stopped. Null with fewer than 2 per part.
 */
export function askRateSeries(items: DecisionWithFeedback[], windows = 6): { from: string; to: string; rate: number; n: number }[] | null {
  const ordered = [...items].sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
  const size = Math.floor(ordered.length / windows);
  if (size < 2) return null;
  return Array.from({ length: windows }, (_, w) => {
    const part = ordered.slice(w * size, w === windows - 1 ? ordered.length : (w + 1) * size);
    return {
      from: timeOf(part[0]),
      to: timeOf(part[part.length - 1]),
      rate: part.filter((i) => ASKED.has(i.decision.autonomy_level)).length / part.length,
      n: part.length,
    };
  });
}

/** For each kind of email: how many decisions, and how many Oscar handled on his own. */
export function kindStats(items: DecisionWithFeedback[]) {
  const out = new Map<string, { kind: string; name: string; n: number; onOwn: number; asked: number; stopped: number }>();
  for (const i of items) {
    const kind = i.decision.email_type ?? "unknown";
    const row = out.get(kind) ?? { kind, name: KIND_NAMES[kind] ?? kind.replace(/_/g, " "), n: 0, onOwn: 0, asked: 0, stopped: 0 };
    row.n++;
    if (ACTED.has(i.decision.autonomy_level)) row.onOwn++;
    if (i.decision.autonomy_level === "ASK_FIRST") row.asked++;
    if (i.decision.autonomy_level === "ESCALATE") row.stopped++;
    out.set(kind, row);
  }
  return [...out.values()].sort((a, b) => b.n - a.n);
}

/** Emails a safety rule or check stopped, newest first. */
export function safetyEvents(items: DecisionWithFeedback[]) {
  return items
    .filter((i) => i.decision.safety_flags.length > 0 || ["safety_check", "model_check", "floor"].includes(i.decision.level_source))
    .filter((i) => i.decision.autonomy_level === "ESCALATE")
    .sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
}

/** The safety checks Oscar ran on one email: what was found, and what wasn't. */
export function safetyChecks(d: Decision): { label: string; ok: boolean }[] {
  const flagged = new Set(d.safety_flags);
  const out = [
    { label: "No request for money", ok: !flagged.has("MONEY") && d.action !== "MOVE_MONEY" },
    { label: "No request for a password or code", ok: !flagged.has("CREDENTIALS") && d.action !== "SEND_CREDENTIALS" },
    { label: "No instructions aimed at Oscar", ok: !flagged.has("PROMPT_INJECTION") },
    { label: "No request for personal info", ok: !flagged.has("SENSITIVE_DATA") },
    { label: "Doesn't commit you to anything", ok: !flagged.has("COMMITMENT") },
    { label: "Doesn't ask to delete anything for good", ok: !flagged.has("IRREVERSIBLE_DELETE") },
    { label: "Easy to undo", ok: riskOf(d).reversible },
  ];
  if (d.level_source === "model_check") out.unshift({ label: "Read closely, it looked risky", ok: false });
  return out;
}

/** What kind of email Oscar thinks it is, in a few words, or null if he couldn't tell. */
export function whatItIs(d: Decision): string | null {
  if (d.summary) return d.summary;
  const kind = d.email_type ?? "unknown";
  if (kind === "unknown" || kind === "bulk") return null;
  return KIND_NAMES[kind] ?? kind.replace(/_/g, " ");
}

/** Whether Oscar really did this and it wasn't undone: in Gmail on the real inbox, or at all on the demo. */
export function reallyDone(i: DecisionWithFeedback): boolean {
  if (i.decision.source !== "gmail") return ACTED.has(i.decision.autonomy_level) && !i.feedback.some((f) => f.kind === "UNDO");
  return !!i.done && !i.done.undone_at && DOABLE.has(i.decision.action);
}

/** "Good morning", "Good afternoon" or "Good evening", by this device's clock. */
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const LAST_VISIT = "oscar.lastVisit";
const THIS_VISIT = "oscar.previousVisit";

/**
 * When you last had Oscar open on this device, for "while you were away". Kept in the browser only
 * (a per-device convenience). Stable for this tab: the first read in a session remembers the previous
 * visit, then marks now as the latest. Null the first time, or if storage is blocked.
 */
export function previousVisit(): number | null {
  try {
    const kept = window.sessionStorage.getItem(THIS_VISIT);
    if (kept !== null) return kept ? Number(kept) : null;
    const last = window.localStorage.getItem(LAST_VISIT);
    window.sessionStorage.setItem(THIS_VISIT, last ?? "");
    window.localStorage.setItem(LAST_VISIT, String(Date.now()));
    return last ? Number(last) : null;
  } catch {
    return null;
  }
}
