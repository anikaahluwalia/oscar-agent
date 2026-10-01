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
  getLearned,
  sendFeedback,
  type AutonomyRow,
  type Brief,
  type DecisionWithFeedback,
  type FeedbackKind,
  type LearnedRow,
} from "@/lib/api";

const CHANGED = "oscar:changed";
export const notifyChanged = () => window.dispatchEvent(new Event(CHANGED));

export const API_DOWN = "I can't reach my API. Start it from the repo root with: .venv/bin/uvicorn oscar.api:app --reload";

export type OscarData = { items: DecisionWithFeedback[]; brief: Brief; autonomy: AutonomyRow[]; learned: LearnedRow[] };

const ANSWERS = new Set<FeedbackKind>(["APPROVE", "REJECT", "UNDO", "EDIT_THEN_SEND"]);
export const isAnswered = (i: DecisionWithFeedback) => i.feedback.some((f) => ANSWERS.has(f.kind));

// The demo sends the same emails again, so only keep Oscar's latest decision on each one.
// The API returns newest first.
function latestPerEmail(items: DecisionWithFeedback[]): DecisionWithFeedback[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.decision.email_id) && seen.add(i.decision.email_id));
}

async function fetchAll(): Promise<OscarData> {
  const [items, brief, autonomy, learned] = await Promise.all([getDecisions(), getBrief(), getAutonomy(), getLearned()]);
  return { items: latestPerEmail(items), brief, autonomy, learned };
}

export function oscarSays(text: string) {
  toast(text, { icon: <OscarAvatar size={22} /> });
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
