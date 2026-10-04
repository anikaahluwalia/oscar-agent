import { ExternalLinkIcon } from "lucide-react";
import { EmailBody } from "@/components/email-body";
import { addressOf, displayName, SenderAvatar } from "@/components/kit/sender";
import type { Decision } from "@/lib/api";
import { when } from "@/lib/counts";
import { useDemoSession } from "@/lib/use-oscar";
import { gmailLink, previewOf } from "@/lib/text";
import { cn } from "@/lib/utils";

const CATEGORY: Record<string, string> = {
  promotions: "Promotions",
  updates: "Updates",
  social: "Social",
  forums: "Forums",
  primary: "Primary",
};

/**
 * The top of an email: who it's from and when, with anything you can change about it on the right
 * (`aside`: what kind of email it is, your category), then the subject.
 */
export function EmailHeader({ decision, aside, className }: { decision: Decision; aside?: React.ReactNode; className?: string }) {
  const address = addressOf(decision.sender);
  const category = decision.gmail?.category ? CATEGORY[decision.gmail.category] : null;
  const link = decision.source === "gmail" && decision.gmail ? gmailLink(decision) : null;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <SenderAvatar sender={decision.sender} size={44} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate text-[15px] font-semibold">{displayName(decision.sender)}</div>
          {address && <div className="truncate text-muted-foreground">{address}</div>}
          <div className="text-muted-foreground">
            to me · {when(decision.gmail?.received_at ?? decision.created_at)}
            {category && ` · ${category}`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aside}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Gmail"
              title="Open in Gmail"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <ExternalLinkIcon className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
      <h2 className="text-[22px] leading-snug font-bold tracking-[-0.015em] text-pretty">{decision.subject || "(no subject)"}</h2>
    </div>
  );
}

/**
 * The email itself. A real email is fetched from Gmail when it's shown and looks the way Gmail
 * shows it, images included (through Oscar). In demo mode the whole made-up email is fetched the
 * same way. The old shared demo inbox only keeps the start of each email.
 */
export function EmailContent({ decision, height }: { decision: Decision; height?: number }) {
  const demo = useDemoSession();
  if (decision.source === "gmail" || demo) return <EmailBody decisionId={decision.id} height={height} />;
  return (
    <div className="rounded-2xl bg-muted/50 p-5 text-[15px] leading-relaxed whitespace-pre-wrap">
      {previewOf(decision) || <span className="text-muted-foreground italic">This email has no text.</span>}
    </div>
  );
}

/** Header and email together, in a card. */
export function EmailPreview({ decision, aside, className }: { decision: Decision; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5 rounded-[22px] border bg-card p-5 sm:p-6", className)} aria-label="The email, as Gmail shows it">
      <EmailHeader decision={decision} aside={aside} />
      <EmailContent decision={decision} />
    </div>
  );
}
