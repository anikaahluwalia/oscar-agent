import { DecisionCard } from "@/components/decision-card";
import { Highlight } from "@/components/highlight";
import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { cleanText } from "@/lib/text";
import { dayLabel, formatTime } from "@/lib/time";

type Props = { item: DecisionWithFeedback; onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean> };

/** The selected email, and Oscar's decision underneath it. */
export function EmailDetail({ item, onFeedback }: Props) {
  const { decision } = item;
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{decision.subject}</h2>
          <StatusPill level={decision.autonomy_level} readOnly={decision.source === "gmail"} className="mt-1.5" />
        </div>
        <p className="text-sm text-muted-foreground">
          {decision.sender} · {dayLabel(decision.created_at)}, {formatTime(decision.created_at)}
        </p>
      </header>
      <p className="leading-relaxed">
        {/* What Oscar noticed is marked, so you can see what he went on. */}
        <Highlight text={cleanText(decision.snippet) || "(No text in this email.)"} phrase={decision.noticed} className="bg-brand/20" />
      </p>
      <DecisionCard key={decision.id} item={item} onFeedback={onFeedback} />
    </article>
  );
}
