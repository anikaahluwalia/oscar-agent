"use client";

import { describeReview } from "@/components/review/answer";
import type { DecisionWithFeedback } from "@/lib/api";
import { isOldWay, whatOscarDid } from "@/lib/labels";
import { cn } from "@/lib/utils";

function Kbd({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <kbd
      className={cn(
        "hidden rounded-md px-[7px] py-0.5 font-sans text-xs font-medium sm:inline",
        onDark ? "bg-primary-foreground/15 text-primary-foreground" : "border bg-card text-muted-foreground",
      )}
    >
      {children}
    </kbd>
  );
}

/** "J K to move", for keyboards only. */
export function KeysHint({ teaches }: { teaches: boolean }) {
  return (
    <span className="hidden items-center gap-1.5 sm:inline-flex">
      <Kbd>J</Kbd>
      <Kbd>K</Kbd> to move{teaches && " · every answer teaches me about this sender"}
    </span>
  );
}

/** What you said about this email before, with a way to change it (or finish an old half-answer). */
export function YouSaid({ item, onChange }: { item: DecisionWithFeedback; onChange: () => void }) {
  const { decision, review, answer: graded } = item;
  if (!review) return null;
  // When your answer was on an earlier read: how this read does against it, compared with that one.
  const now = !graded?.from_earlier
    ? null
    : graded.error === "none"
      ? graded.earlier_error === "none"
        ? "I still get this right."
        : "I get this right now."
      : graded.earlier_error === "none"
        ? `Now I'd: ${whatOscarDid(decision, item.done).toLowerCase()}, which is different from what you said was right.`
        : `Now I'd: ${whatOscarDid(decision, item.done).toLowerCase()}, still not right.`;
  const plainYes = review.label === "CORRECT" && !review.complete;
  const old = isOldWay(review);
  const said = review.label === "SKIP" ? "Not sure" : plainYes ? "Yes, that's right" : describeReview(review);
  const prefix = graded?.from_earlier ? "About an earlier read, you said" : "You said";
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-dashed bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p>
          {plainYes || review.label === "SKIP" || old ? `${prefix}: ` : `${prefix} I should: `}
          <span className="font-semibold">{said}</span>
        </p>
        <button type="button" onClick={onChange} className="min-h-11 font-semibold underline-offset-4 hover:underline">
          {old ? "Finish it" : "Change"}
        </button>
      </div>
      {old && <p className="text-[13px] text-muted-foreground">This is from before I asked what I should have done. Finish it so it counts.</p>}
      {now && <p className="text-[13px] text-muted-foreground">{now}</p>}
    </div>
  );
}
