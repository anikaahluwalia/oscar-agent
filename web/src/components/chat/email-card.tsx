import { InboxLink } from "@/components/inbox/inbox-link";
import { displayName, SenderAvatar } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import type { DecisionWithFeedback } from "@/lib/api";
import { didLine, when } from "@/lib/counts";

/** An email Oscar mentions, inside his bubble. It opens the email in Inbox. */
export function EmailCard({ item }: { item: DecisionWithFeedback }) {
  const { decision } = item;
  return (
    <InboxLink
      id={decision.id}
      className="flex min-h-11 items-center gap-3 rounded-[14px] border bg-muted px-3.5 py-3 text-foreground no-underline transition-colors hover:bg-surface-hover"
    >
      <SenderAvatar sender={decision.sender} size={36} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">
          <b className="font-bold">{displayName(decision.sender)}</b>
          <span className="text-muted-foreground"> · {when(decision.created_at)}</span>
        </span>
        <span className="truncate text-sm">{decision.subject || "(no subject)"}</span>
        <StatusWords level={decision.autonomy_level} className="mt-1 text-xs sm:hidden">
          {didLine(item)}
        </StatusWords>
      </span>
      <StatusWords level={decision.autonomy_level} className="hidden shrink-0 text-xs sm:inline-flex">
        {didLine(item)}
      </StatusWords>
    </InboxLink>
  );
}
