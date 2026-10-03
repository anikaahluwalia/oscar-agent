import { ExternalLinkIcon } from "lucide-react";
import { EmailBody } from "@/components/email-body";
import { Highlight } from "@/components/highlight";
import { SenderAvatar } from "@/components/review/sender-avatar";
import { splitSender } from "@/components/review/filters";
import type { DecisionWithFeedback } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { cleanText, gmailLink } from "@/lib/text";
import { dayLabel, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The open email: its subject, who it's from and when, then the email itself. A real one is
 * fetched whole from Gmail when you open it; an example email shows the start Oscar kept, with
 * what he noticed marked.
 */
export function EmailPane({ item, className }: { item: DecisionWithFeedback; className?: string }) {
  const d = item.decision;
  const real = d.source === "gmail";
  const { name, address } = splitSender(d.sender);
  const when = timeOf(item);
  const link = gmailLink(d);
  const text = cleanText(d.snippet);

  return (
    <article aria-label="The email" className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card", className)}>
      <header className="flex flex-col gap-4 border-b pb-4">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold tracking-tight text-balance break-words">{d.subject || "(no subject)"}</h2>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in Gmail"
              className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SenderAvatar sender={d.sender} size={36} />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{name}</span>
            {address && <span className="block truncate text-muted-foreground">&lt;{address}&gt;</span>}
          </p>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {dayLabel(when)}, {formatTime(when)}
          </span>
        </div>
      </header>

      {real ? (
        <EmailBody key={d.id} decisionId={d.id} />
      ) : text ? (
        <p className="text-sm leading-relaxed">
          <Highlight text={text} phrase={d.noticed} className="bg-status-needs/15" />
          {d.snippet.length >= 160 && <span className="text-muted-foreground">…</span>}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">This email has no text.</p>
      )}
      {d.noticed && (real || !text.toLowerCase().includes(d.noticed.toLowerCase())) && (
        <p className="text-sm text-muted-foreground">
          Oscar noticed <mark className="rounded-sm bg-status-needs/15 px-0.5 text-foreground">&ldquo;{d.noticed}&rdquo;</mark>
        </p>
      )}
      {!real && <p className="text-xs text-muted-foreground">An example email. Oscar keeps only the start of each one.</p>}
    </article>
  );
}
