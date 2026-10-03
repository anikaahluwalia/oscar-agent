"use client";

// Loads everything the pages need from the Oscar API and keeps it fresh.
// There's one copy of the data for the whole app: the sidebar, the page and the
// drawers all read it. Anything that changes Oscar's state calls notifyChanged().

import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { OscarAvatar } from "@/components/oscar-avatar";
import { wouldOnly } from "@/lib/labels";
import {
  getAutonomy,
  getBrief,
  getDecisions,
  getGmailStatus,
  getLearned,
  getReviewSummary,
  sendFeedback,
  type AutonomyRow,
  type Brief,
  type Decision,
  type DecisionWithFeedback,
  type FeedbackKind,
  type GmailStatus,
  type LearnedRow,
  type ReviewSummary,
  type Level,
} from "@/lib/api";

const CHANGED = "oscar:changed";
export const notifyChanged = () => window.dispatchEvent(new Event(CHANGED));

export const API_DOWN = "I can't reach my API. Start it from the repo root with: .venv/bin/uvicorn oscar.api:app --reload";

/** Gmail is connected and Oscar only reads it (before Stage 12, or with acting turned off). */
export const isReadOnly = (data: OscarData) => data.gmail.connected && data.gmail.read_only;

export type OscarData = {
  items: DecisionWithFeedback[]; // Oscar's latest decision on each email
  all: DecisionWithFeedback[]; // every decision, for counting your answers
  brief: Brief;
  autonomy: AutonomyRow[];
  learned: LearnedRow[];
  gmail: GmailStatus;
  reviews: ReviewSummary;
};

const ANSWERS = new Set<FeedbackKind>(["APPROVE", "REJECT", "UNDO", "EDIT_THEN_SEND", "SEEN"]);
/** You've dealt with it: answered Oscar, or (on the real inbox, which is read-only) reviewed his decision. */
export const isAnswered = (i: DecisionWithFeedback) =>
  (wouldOnly(i.decision) && !!i.review) || i.feedback.some((f) => ANSWERS.has(f.kind));
/** Still waiting on you: an ask you haven't answered, or something Oscar stopped that you haven't reviewed. */
export const isOpen = (i: DecisionWithFeedback) =>
  (i.decision.autonomy_level === "ASK_FIRST" || i.decision.autonomy_level === "ESCALATE") && !wouldOnly(i.decision) && !isAnswered(i);

/** Something Oscar did and told you about that you haven't checked yet. Worth a look, but not blocking. */
export const isUnchecked = (i: DecisionWithFeedback) => i.decision.autonomy_level === "PROCEED_AND_NOTIFY" && !isAnswered(i);

export type Answers = { approved: number; declined: number; undone: number };

/** How you've actually answered Oscar for one sender and action: real counts, not weighted evidence. */
export function answersFor(all: DecisionWithFeedback[], sender: string, action: string): Answers {
  const out: Answers = { approved: 0, declined: 0, undone: 0 };
  for (const { decision, feedback } of all) {
    if (decision.sender !== sender || decision.action !== action) continue;
    for (const f of feedback) {
      if (f.kind === "APPROVE" || f.kind === "EDIT_THEN_SEND") out.approved++;
      if (f.kind === "REJECT") out.declined++;
      if (f.kind === "UNDO") out.undone++;
    }
  }
  return out;
}

export type Counts = Record<Level, number>;

/** Handled and FYI count everything Oscar did; Needs You and Blocked count what's still open. */
export function countsOf(items: DecisionWithFeedback[]): Counts {
  const of = (level: Level, open = false) =>
    items.filter((i) => i.decision.autonomy_level === level && (!open || isOpen(i))).length;
  return {
    PROCEED_SILENTLY: of("PROCEED_SILENTLY"),
    PROCEED_AND_NOTIFY: of("PROCEED_AND_NOTIFY"),
    ASK_FIRST: of("ASK_FIRST", true),
    ESCALATE: of("ESCALATE", true),
  };
}

// The demo sends the same emails again, so only keep Oscar's latest decision on each one.
// The API returns newest first.
function latestPerEmail(items: DecisionWithFeedback[]): DecisionWithFeedback[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.decision.email_id) && seen.add(i.decision.email_id));
}

async function fetchAll(): Promise<OscarData> {
  const [items, brief, autonomy, learned, gmail, reviews] = await Promise.all([
    getDecisions(),
    getBrief(),
    getAutonomy(),
    getLearned(),
    getGmailStatus(),
    getReviewSummary(),
  ]);
  return { items: latestPerEmail(items), all: items, brief, autonomy, learned, gmail, reviews };
}

export function oscarSays(text: string) {
  toast(text, { icon: <OscarAvatar size={22} /> });
}

const UNDO_WINDOW_MS = 10_000;

/**
 * After new emails come in, tell you about what Oscar did with a heads-up, with a
 * chance to undo it. That's what PROCEED_AND_NOTIFY means. Silent actions stay
 * silent; they can still be undone from All email.
 */
export function offerUndo(decisions: Decision[]) {
  const told = decisions.filter((d) => d.autonomy_level === "PROCEED_AND_NOTIFY");
  if (told.length > 3) {
    toast(`Heads up! I took care of ${told.length} emails.`, {
      icon: <OscarAvatar size={22} />,
      description: "They're marked FYI in your inbox if you want to check or undo any.",
      duration: UNDO_WINDOW_MS,
    });
    return;
  }
  for (const d of told) {
    toast(d.subject, {
      icon: <OscarAvatar size={22} />,
      description: d.message,
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            const { reply } = await sendFeedback(d.id, "UNDO");
            oscarSays(reply);
            notifyChanged();
          } catch (e) {
            oscarSays(e instanceof Error ? e.message : "Something went wrong.");
          }
        },
      },
    });
  }
}

type Store = { data: OscarData | null; error: boolean };
let store: Store = { data: null, error: false };
const listeners = new Set<() => void>();
let loading = false;
let again = false; // something changed while we were loading, so load once more after
let retry: ReturnType<typeof setTimeout> | null = null;

/** Fetches everything. `changed` means Oscar's state just changed, so a load already on its way may be stale. */
function load(changed = true) {
  if (loading) {
    again ||= changed;
    return;
  }
  loading = true;
  fetchAll()
    .then(
      (data) => void (store = { data, error: false }),
      () => void (store = { ...store, error: true }),
    )
    .finally(() => {
      loading = false;
      listeners.forEach((l) => l());
      if (again) {
        again = false;
        load();
      } else if (store.error && listeners.size && !retry) {
        // The API is down. Keep trying, so the app comes back by itself once it's started.
        retry = setTimeout(() => {
          retry = null;
          load(false);
        }, 5000);
      }
    });
}

const onChanged = () => load();
const onFocus = () => load(false);
const REFRESH_MS = 60_000; // Oscar checks Gmail on his own, so look for his new decisions now and then
let refresh: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener(CHANGED, onChanged);
    window.addEventListener("focus", onFocus);
    refresh = setInterval(() => document.visibilityState === "visible" && load(false), REFRESH_MS);
  }
  // Each new page refreshes, so moving around the app never shows old data for long.
  load(false);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener(CHANGED, onChanged);
      window.removeEventListener("focus", onFocus);
      if (refresh) clearInterval(refresh);
      refresh = null;
    }
  };
}

const SERVER: Store = { data: null, error: false };

export function useOscar() {
  const { data, error } = useSyncExternalStore(subscribe, () => store, () => SERVER);

  const feedback = useCallback(async (decisionId: string, kind: FeedbackKind, editedText?: string) => {
    try {
      const { reply } = await sendFeedback(decisionId, kind, editedText);
      oscarSays(reply);
      notifyChanged();
      return true;
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    }
  }, []);

  return { data, error, loading: !data && !error, feedback };
}
