import { DecisionCard } from "@/components/decision-card";
import { EmailBody } from "@/components/email-body";
import { Highlight } from "@/components/highlight";
import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { ExternalLinkIcon } from "lucide-react";
import { gmailLink, previewOf } from "@/lib/text";
import { dayLabel, formatTime } from "@/lib/time";

type Props = { item: DecisionWithFeedback; onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean> };

/**
 * The start of the email, with what Oscar noticed marked. Oscar only keeps the start
 * of each email, so for a real one there's a link to the whole thing in Gmail.
 */
function EmailPreview({ decision }: { decision: DecisionWithFeedback["decision"] }) {
  const preview = previewOf(decision);
  const noticed = decision.noticed;
  const shown = noticed && preview.toLowerCase().includes(noticed.toLowerCase());
  const link = gmailLink(decision);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-4">
      {preview ? (
        <p className="leading-relaxed">
          <Highlight text={preview} phrase={noticed} className="bg-status-needs/15" />
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No preview. This email is mostly images or links.</p>
      )}
      {noticed && !shown && (
        <p className="text-sm text-muted-foreground">
          Oscar noticed <mark className="rounded-sm bg-status-needs/15 px-0.5 text-foreground">&ldquo;{noticed}&rdquo;</mark>
        </p>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Open in Gmail <ExternalLinkIcon className="size-3.5" />
        </a>
      )}
    </div>
  );
}

/** Under a real email: what Oscar noticed, and the email in Gmail. */
function EmailLinks({ decision }: { decision: DecisionWithFeedback["decision"] }) {
  const link = gmailLink(decision);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      {decision.noticed ? (
        <span>
          Oscar noticed <mark className="rounded-sm bg-status-needs/15 px-0.5 text-foreground">&ldquo;{decision.noticed}&rdquo;</mark>
        </span>
      ) : (
        <span />
      )}
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline">
          Open in Gmail <ExternalLinkIcon className="size-3.5" />
        </a>
      )}
    </div>
  );
}

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
      {decision.source === "gmail" ? (
        <div className="flex flex-col gap-2">
          <EmailBody decisionId={decision.id} />
          <EmailLinks decision={decision} />
        </div>
      ) : (
        <EmailPreview decision={decision} />
      )}
      <DecisionCard key={decision.id} item={item} onFeedback={onFeedback} />
    </article>
  );
}
