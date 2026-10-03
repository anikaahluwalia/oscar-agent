import Link from "next/link";
import { addressOf, SenderAvatar } from "@/components/kit/sender";
import { Button } from "@/components/ui/button";
import type { Decision, DecisionWithFeedback, Proposal } from "@/lib/api";
import { answerProposal } from "@/lib/chat-store";
import { plural } from "@/lib/counts";

const MONTH = 30 * 86_400_000;

/** How many emails from the last 30 days the rule matches: same sender and same action, as the rule works. */
function coveredBy(about: Decision, items: DecisionWithFeedback[]): number {
  const since = Date.now() - MONTH;
  return items.filter(
    ({ decision: d }) => d.sender === about.sender && d.action === about.action && new Date(d.created_at).getTime() >= since,
  ).length;
}

/** A rule Oscar would follow, waiting on your yes or no. */
export function RuleCard({
  proposal,
  answered,
  index,
  items,
}: {
  proposal: Proposal;
  answered?: "yes" | "no";
  index: number;
  items: DecisionWithFeedback[];
}) {
  const about = items.find((i) => i.decision.id === proposal.decision_id)?.decision;
  const covered = about ? coveredBy(about, items) : 0;
  // The address, unless the rule already says it.
  const address = about ? addressOf(about.sender) : "";
  const showAddress = address && !proposal.text.toLowerCase().includes(address.toLowerCase());
  return (
    <>
      <div className="overflow-hidden rounded-2xl border">
        <div className="flex items-center gap-3 px-4 py-3.5">
          {about && <SenderAvatar sender={about.sender} size={36} />}
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-[15px] font-semibold">{proposal.text}</p>
            {showAddress && <p className="truncate text-[13px] text-muted-foreground">{address}</p>}
          </div>
        </div>
        <p className="bg-muted px-4 py-2.5 text-[13px] text-muted-foreground">
          For new emails from now on.
          {!!covered && ` It would have covered ${plural(covered, "email", "emails")} in the last 30 days.`} I&apos;ll still
          bring you anything risky.
        </p>
      </div>
      {answered ? (
        <p className="text-[13px] font-semibold text-muted-foreground">{answered === "yes" ? "You said yes." : "You said no."}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 px-5 text-[15px] font-semibold" onClick={() => answerProposal(index, true)}>
            Yes, do this
          </Button>
          <Button variant="outline" className="h-11 bg-card px-5 text-[15px] font-semibold" onClick={() => answerProposal(index, false)}>
            No
          </Button>
        </div>
      )}
      <p className="text-[13px] leading-normal text-muted-foreground">
        You can change or forget it any time in{" "}
        <Link href="/knows" className="font-semibold text-foreground underline-offset-4 hover:underline">
          What Oscar knows
        </Link>
        .
      </p>
    </>
  );
}
