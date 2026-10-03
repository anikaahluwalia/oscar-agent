import { ExternalLinkIcon } from "lucide-react";
import { EmailBody } from "@/components/email-body";
import { addressOf, displayName, SenderAvatar } from "@/components/kit/sender";
import type { Decision } from "@/lib/api";
import { when } from "@/lib/counts";
import { gmailLink, previewOf } from "@/lib/text";
import { cn } from "@/lib/utils";

const CATEGORY: Record<string, string> = {
  promotions: "Promotions",
  updates: "Updates",
  social: "Social",
  forums: "Forums",
  primary: "Primary",
};

/** The top of an email, as Gmail shows it: subject, then who it's from and when. */
export function EmailHeader({ decision, className }: { decision: Decision; className?: string }) {
  const address = addressOf(decision.sender);
  const category = decision.gmail?.category ? CATEGORY[decision.gmail.category] : null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <h2 className="text-xl font-bold tracking-[-0.015em] text-pretty">{decision.subject || "(no subject)"}</h2>
      <div className="flex items-center gap-3">
        <SenderAvatar sender={decision.sender} size={40} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate">
            <b>{displayName(decision.sender)}</b> {address && <span className="text-muted-foreground">&lt;{address}&gt;</span>}
          </div>
          <div className="text-muted-foreground">
            to me · {when(decision.gmail?.received_at ?? decision.created_at)}
            {category && ` · ${category}`}
          </div>
        </div>
        {decision.source === "gmail" && decision.gmail && (
          <a
            href={gmailLink(decision) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold hover:underline"
          >
            Open in Gmail <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The email itself. A real email is fetched from Gmail when it's shown and looks the way Gmail
 * shows it, images included (through Oscar). The demo inbox only keeps the start of each email.
 */
export function EmailContent({ decision }: { decision: Decision }) {
  if (decision.source === "gmail") return <EmailBody decisionId={decision.id} />;
  return (
    <div className="rounded-2xl bg-muted/50 p-5 text-[15px] leading-relaxed whitespace-pre-wrap">
      {previewOf(decision) || <span className="text-muted-foreground italic">This email has no text.</span>}
    </div>
  );
}

/** Header and email together, in a white card. */
export function EmailPreview({ decision, className }: { decision: Decision; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-[22px] border bg-card p-5 sm:p-6", className)} aria-label="The email, as Gmail shows it">
      <EmailHeader decision={decision} />
      <EmailContent decision={decision} />
    </div>
  );
}
