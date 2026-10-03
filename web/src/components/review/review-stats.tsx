import type { DecisionWithFeedback } from "@/lib/api";
import { isOldWay, wouldOnly } from "@/lib/labels";
import { isAnswered, type OscarData } from "@/lib/use-oscar";

function Item({ value, label, tone }: { value: string; label: string; tone?: "blocked" }) {
  return (
    <li className={tone === "blocked" ? "text-status-blocked" : undefined}>
      <span className={tone ? "font-semibold tabular-nums" : "font-semibold tabular-nums text-foreground"}>{value}</span> {label}
    </li>
  );
}

const habits = (n: number) => (n === 1 ? "habit learned" : "habits learned");

/**
 * One line about how reviewing is going. Every number comes from your answers and Oscar's real
 * decisions; nothing is estimated. If there aren't any answers yet, it says so.
 */
export function ReviewStats({ data, items }: { data: OscarData; items: DecisionWithFeedback[] }) {
  const real = items.some((i) => i.decision.source === "gmail");
  const learned = data.learned.length;

  if (!real) {
    // The demo inbox: what he asked about or stopped, and how many of those you've answered.
    const asks = items.filter((i) => (i.decision.autonomy_level === "ASK_FIRST" || i.decision.autonomy_level === "ESCALATE") && !wouldOnly(i.decision));
    const answered = asks.filter(isAnswered).length;
    return (
      <ul aria-label="How reviewing is going" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <Item value={`${answered.toLocaleString()} of ${asks.length.toLocaleString()}`} label={asks.length === 1 ? "ask answered" : "asks answered"} />
        <Item value={learned.toLocaleString()} label={habits(learned)} />
      </ul>
    );
  }

  const reviewed = items.filter((i) => i.review && !isOldWay(i.review)).length;
  const { agreement, scored, graded } = data.reviews;
  const unsafe = "acted_when_you_would_stop" in graded ? graded.acted_when_you_would_stop : 0;
  return (
    <ul aria-label="How reviewing is going" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
      <Item value={`${reviewed.toLocaleString()} of ${items.length.toLocaleString()}`} label="checked" />
      {agreement !== null && scored > 0 ? (
        <Item value={`${Math.round(agreement * 100)}%`} label={`right, by your ${scored.toLocaleString()} ${scored === 1 ? "answer" : "answers"}`} />
      ) : (
        <li>No answers yet to say how often he&apos;s right</li>
      )}
      <Item value={learned.toLocaleString()} label={habits(learned)} />
      {unsafe > 0 && <Item value={unsafe.toLocaleString()} label={unsafe === 1 ? "acted when you'd have stopped it" : "acted when you'd have stopped them"} tone="blocked" />}
    </ul>
  );
}
