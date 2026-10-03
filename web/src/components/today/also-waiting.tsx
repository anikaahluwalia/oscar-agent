import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { EmailLink } from "@/components/email-link";
import { addressOf, displayName, SenderAvatar } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import type { DecisionWithFeedback } from "@/lib/api";
import { waitWords } from "@/components/today/words";

const SHOWN = 5;

/** The rest of what's waiting, short: who it's from, the subject, and what kind of wait it is. */
export function AlsoWaiting({ items, total, readOnly }: { items: DecisionWithFeedback[]; total: number; readOnly: boolean }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="also-waiting" className="flex flex-col">
      <h2 id="also-waiting" className="mb-1 text-sm font-semibold text-muted-foreground sm:text-[15px]">
        Also waiting
      </h2>
      <ul>
        {items.slice(0, SHOWN).map((item) => {
          const { decision } = item;
          const address = addressOf(decision.sender);
          return (
            <li key={decision.id} className="border-t">
              <EmailLink id={decision.id} className="group flex min-h-11 items-center gap-3 py-3">
                <SenderAvatar sender={decision.sender} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {displayName(decision.sender)}
                    {address && <span className="font-normal text-muted-foreground"> · {address}</span>}
                  </span>
                  <span className="block truncate text-sm text-foreground/80 group-hover:underline">{decision.subject || "(no subject)"}</span>
                </span>
                <StatusWords level={decision.autonomy_level} className="shrink-0">
                  <span className="sr-only sm:not-sr-only">{waitWords(item, readOnly)}</span>
                </StatusWords>
              </EmailLink>
            </li>
          );
        })}
      </ul>
      {items.length > SHOWN && (
        <Link
          href="/review"
          className="flex min-h-11 items-center gap-1 self-start text-sm font-semibold underline-offset-4 hover:underline"
        >
          See all {total.toLocaleString()} in Review <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      )}
    </section>
  );
}
