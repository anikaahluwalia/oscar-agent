import { SenderAvatar, addressOf } from "@/components/kit/sender";
import { Button } from "@/components/ui/button";
import type { Action, DecisionWithFeedback, FeedbackKind, LearnedRow } from "@/lib/api";

const ASKS: Partial<Record<Action, (who: string) => React.ReactNode>> = {
  ARCHIVE: (who) => <>Archive emails from <b>{who}</b> from now on?</>,
  MARK_READ: (who) => <>Mark emails from <b>{who}</b> as read without asking?</>,
  APPLY_LABEL: (who) => <>Label emails from <b>{who}</b> without asking?</>,
};

/**
 * Where Oscar is close but not allowed to act alone yet: an easy-to-undo action you've said yes
 * to for a sender at least twice, never no, with no level learned yet. Yes is a rule from you
 * ("always do this": he does it and tells you, and the safety rules still win), and he does the
 * ones from that sender already waiting too, so you don't approve them again; No is "always ask".
 *
 * The answer is saved on one of that sender's emails, so it has to be one a rule can be about:
 * nothing he brought to you or a safety rule flagged. On those he learns nothing from an answer
 * (oscar/preferences.py add, feedback.floor_reply), so Yes and No would leave the question here.
 * Not one you've deleted in Gmail either.
 */
const canTeach = (i: DecisionWithFeedback) =>
  !i.gone && i.decision.autonomy_level !== "ESCALATE" && !i.decision.safety_flags.length;

export function candidates(learned: LearnedRow[], items: DecisionWithFeedback[]) {
  return learned
    .filter((r) => ASKS[r.action] && !r.always_ask && r.no === 0 && r.yes >= 2 && !r.level)
    .map((r) => ({ row: r, item: items.find((i) => i.decision.sender === r.sender && i.decision.action === r.action && canTeach(i)) }))
    .filter((c): c is { row: LearnedRow; item: DecisionWithFeedback } => !!c.item)
    .sort((a, b) => b.row.yes - a.row.yes)
    .slice(0, 3);
}

export function ApproveActions({ learned, items, onAnswer }: {
  learned: LearnedRow[];
  items: DecisionWithFeedback[];
  onAnswer: (decisionId: string, kind: FeedbackKind) => void;
}) {
  const rows = candidates(learned, items);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="approve" className="flex flex-col gap-2.5">
      <h2 id="approve" className="text-lg font-bold">
        Approve actions
      </h2>
      {rows.map(({ row, item }) => (
        <div key={`${row.sender}|${row.action}`} className="flex flex-wrap items-center gap-3.5 rounded-[20px] border bg-card px-4 py-4 sm:px-5">
          <SenderAvatar sender={row.sender} size={40} />
          <div className="min-w-[13rem] flex-1">
            <div className="break-words">{ASKS[row.action]!(addressOf(row.sender) || row.sender)}</div>
            <div className="text-[13px] text-muted-foreground">You&apos;ve said yes to this {row.yes.toLocaleString()} times.</div>
          </div>
          <div className="flex gap-2">
            <Button className="h-11 rounded-full px-5 sm:h-10" onClick={() => onAnswer(item.decision.id, "ALWAYS_DO_THIS")}>
              Yes
            </Button>
            <Button variant="outline" className="h-11 rounded-full px-4 sm:h-10" onClick={() => onAnswer(item.decision.id, "ALWAYS_ASK_ME")}>
              No
            </Button>
          </div>
        </div>
      ))}
      <p className="text-[13px] text-muted-foreground">
        Yes means I&apos;ll do the ones waiting now, and from now on I&apos;ll do it and tell you. Anything risky still comes
        to you. Change it any time in What Oscar knows.
      </p>
    </section>
  );
}
