"use client";

// Loads everything the pages need from the Oscar API and keeps it fresh.
// Anything that changes Oscar's state calls notifyChanged(), and every page
// using this hook reloads.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { OscarAvatar } from "@/components/oscar-avatar";
import {
  getAutonomy,
  getBrief,
  getDecisions,
  sendFeedback,
  type AutonomyRow,
  type Brief,
  type Decision,
  type DecisionWithFeedback,
  type FeedbackKind,
} from "@/lib/api";

const CHANGED = "oscar:changed";
export const notifyChanged = () => window.dispatchEvent(new Event(CHANGED));

export const API_DOWN = "I can't reach my API. Start it from the repo root with: .venv/bin/uvicorn oscar.api:app --reload";

export type OscarData = { items: DecisionWithFeedback[]; brief: Brief; autonomy: AutonomyRow[] };

const ANSWERS = new Set<FeedbackKind>(["APPROVE", "REJECT", "UNDO", "EDIT_THEN_SEND"]);
export const isAnswered = (i: DecisionWithFeedback) => i.feedback.some((f) => ANSWERS.has(f.kind));
// Done: Oscar handled it quietly, or you've already answered. These live on the Activity page.
export const isDone = (i: DecisionWithFeedback) => i.decision.autonomy_level === "PROCEED_SILENTLY" || isAnswered(i);

// The demo sends the same emails again, so only keep Oscar's latest decision on each one.
// The API returns newest first.
function latestPerEmail(items: DecisionWithFeedback[]): DecisionWithFeedback[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.decision.email_id) && seen.add(i.decision.email_id));
}

async function fetchAll(): Promise<OscarData> {
  const [items, brief, autonomy] = await Promise.all([getDecisions(), getBrief(), getAutonomy()]);
  return { items: latestPerEmail(items), brief, autonomy };
}

export function oscarSays(text: string) {
  toast(text, { icon: <OscarAvatar size={22} /> });
}

const UNDO_WINDOW_MS = 10_000;

/**
 * After new emails come in, tell you about what Oscar did with a heads-up, with a
 * chance to undo it. That's what PROCEED_AND_NOTIFY means. Silent actions stay
 * silent; they can still be undone from Home.
 */
export function offerUndo(decisions: Decision[]) {
  const told = decisions.filter((d) => d.autonomy_level === "PROCEED_AND_NOTIFY");
  if (told.length > 3) {
    toast(`Heads up: I took care of ${told.length} emails.`, {
      icon: <OscarAvatar size={22} />,
      description: "They're under Told you on Home if you want to check or undo any.",
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

export function useOscar() {
  const [data, setData] = useState<OscarData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchAll().then(
        (d) => {
          if (!cancelled) {
            setData(d);
            setError(false);
          }
        },
        () => !cancelled && setError(true),
      );
    load();
    window.addEventListener(CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGED, load);
    };
  }, []);

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
