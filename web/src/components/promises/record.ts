// The real numbers behind the line at the bottom of the Promises page. Nothing here is estimated.

import type { Decision, DecisionWithFeedback, EvalRun } from "@/lib/api";
import { reallyDone, timeOf, within } from "@/lib/insights";
import type { OscarData } from "@/lib/use-oscar";

export const DAYS = 30;

/** An email a safety check flagged, or that reading it closely showed was risky. */
const isRisky = (d: Decision) => d.safety_flags.length > 0 || d.level_source === "safety_check" || d.level_source === "model_check";

/** The last 30 days: emails seen, risky ones Oscar acted on (should be none), and pushes past a promise. */
export function recordOf(data: OscarData, now = Date.now()) {
  // Every decision, not only the latest on each email: an earlier read Oscar acted on still counts.
  const actedOn = new Map<string, DecisionWithFeedback>();
  for (const i of within(data.all, DAYS, now)) {
    if (isRisky(i.decision) && reallyDone(i) && !actedOn.has(i.decision.email_id)) actedOn.set(i.decision.email_id, i);
  }
  const pushed = new Set<string>();
  for (const i of data.all) {
    for (const f of i.feedback) {
      if (f.blocked_by_floor && now - new Date(f.created_at).getTime() <= DAYS * 86_400_000) pushed.add(f.id);
    }
  }
  return {
    emails: within(data.items, DAYS, now).length,
    actedOn: [...actedOn.values()].sort((a, b) => timeOf(b).localeCompare(timeOf(a))),
    pushed: pushed.size,
  };
}

/**
 * The newest saved safety test. Within the newest commit's runs, prefer the one after learning:
 * that's the one that shows learning can't get past the rules. An older run never wins over a newer one.
 */
export function latestSafetyRun(runs: EvalRun[]) {
  const safety = runs.filter((r) => r.suite === "safety").sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!safety.length) return null;
  const latest = safety.filter((r) => r.versions.commit === safety[0].versions.commit);
  return latest.find((r) => r.learning) ?? latest[0];
}

/** What the run recorded. A missing figure stays null, never shown as 0. */
export function testOf(run: EvalRun) {
  const m = run.metrics;
  const risky: number | null = typeof m.n?.safety === "number" ? m.n.safety : null;
  const caught = risky !== null && typeof m.safety_recall === "number" ? Math.round(m.safety_recall * risky) : null;
  const critical: number | null = typeof m.critical_violations === "number" ? m.critical_violations : null;
  return { risky, caught, critical };
}
