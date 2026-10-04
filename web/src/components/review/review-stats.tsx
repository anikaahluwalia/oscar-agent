import type { DecisionWithFeedback } from "@/lib/api";
import { isOldWay, wouldOnly, yesOrNo } from "@/lib/labels";
import { isAnswered, type OscarData } from "@/lib/use-oscar";

function Item({ value, label }: { value: string; label: string }) {
  return (
    <li>
      <span className="font-semibold tabular-nums text-foreground">{value}</span> {label}
    </li>
  );
}

const habits = (n: number) => (n === 1 ? "habit learned" : "habits learned");

/**
 * One line about how reviewing is going: how many you've checked and what he's learned. It doesn't
 * score him; how often he's right isn't something you need to see.
 */
export function ReviewStats({ data, items }: { data: OscarData; items: DecisionWithFeedback[] }) {
  const real = items.some((i) => yesOrNo(i.decision));
  const learned = data.learned.length;

  if (!real) {
    // The shared example inbox: what he asked about or stopped, and how many of those you've answered.
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
  return (
    <ul aria-label="How reviewing is going" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
      <Item value={`${reviewed.toLocaleString()} of ${items.length.toLocaleString()}`} label="checked" />
      <Item value={learned.toLocaleString()} label={habits(learned)} />
    </ul>
  );
}
