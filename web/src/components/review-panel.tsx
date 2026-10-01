"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendReview, type Action, type DecisionWithFeedback, type Level, type ReviewLabel } from "@/lib/api";
import { ACTIONS, REVIEW_DETAIL, REVIEW_LABELS, STATUS } from "@/lib/labels";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const LEVEL_ORDER: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"];

/**
 * Scoring one of Oscar's decisions on the real inbox. This is for measuring him,
 * not teaching him: he doesn't learn from reviews.
 */
export function ReviewPanel({ item }: { item: DecisionWithFeedback }) {
  const { decision, review } = item;
  const [picked, setPicked] = useState<ReviewLabel | null>(null);
  const [level, setLevel] = useState<Level | "">("");
  const [action, setAction] = useState<Action | "">("");
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const detail = picked ? REVIEW_DETAIL[picked] : undefined;

  async function save(label: ReviewLabel) {
    setBusy(true);
    try {
      await sendReview({
        decision_id: decision.id,
        label,
        should_be_level: level || null,
        should_be_action: action || null,
        actual_type: type.trim() || null,
        note: note.trim() || null,
      });
      setPicked(null);
      notifyChanged();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function pick(label: ReviewLabel) {
    // Labels with no "should have been" save straight away; the rest ask for it first.
    if (REVIEW_DETAIL[label] || label === picked) {
      setPicked(label === picked ? null : label);
      return;
    }
    void save(label);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">How did Oscar do?</p>
        {review && (
          <p className="text-xs text-muted-foreground">
            You said: <span className="text-foreground">{REVIEW_LABELS[review.label].label}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Review">
        {(Object.keys(REVIEW_LABELS) as ReviewLabel[]).map((label) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            title={REVIEW_LABELS[label].meaning}
            aria-pressed={(picked ?? review?.label) === label}
            onClick={() => pick(label)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              (picked ?? review?.label) === label && "border-transparent bg-foreground text-background hover:bg-foreground hover:text-background",
            )}
          >
            {REVIEW_LABELS[label].label}
          </button>
        ))}
      </div>

      {picked && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">{REVIEW_LABELS[picked].meaning}</p>
          {detail === "level" && (
            <label className="flex items-center gap-2">
              Should have been
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="rounded-md border bg-background px-2 py-1">
                <option value="">Choose</option>
                {LEVEL_ORDER.filter((l) => l !== decision.autonomy_level).map((l) => (
                  <option key={l} value={l}>
                    {STATUS[l].label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {detail === "action" && (
            <label className="flex items-center gap-2">
              Should have been
              <select value={action} onChange={(e) => setAction(e.target.value as Action)} className="rounded-md border bg-background px-2 py-1">
                <option value="">Choose</option>
                {(Object.keys(ACTIONS) as Action[])
                  .filter((a) => a !== decision.action)
                  .map((a) => (
                    <option key={a} value={a}>
                      {ACTIONS[a]}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {detail === "type" && (
            <label className="flex items-center gap-2">
              It&apos;s actually a
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="recruiter email, receipt…"
                className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1"
              />
            </label>
          )}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else? (optional)" className="min-h-16" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || (detail === "type" && !type.trim())} onClick={() => save(picked)}>
              Save review
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Reviews measure Oscar. He doesn&apos;t learn from them.</p>
    </div>
  );
}
