"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { EmailLink } from "@/components/email-link";
import { didLine, when } from "@/lib/counts";
import { Panel } from "@/components/kit/panel";
import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback } from "@/lib/api";
import { wouldOnly } from "@/lib/labels";

const SHOWN = 5;

export function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-my-2 flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4"
    >
      {children} <ArrowRightIcon className="size-3.5" aria-hidden />
    </Link>
  );
}

/** The newest few things Oscar did, each opening the email in Activity. */
export function RecentActivity({ items, className }: { items: DecisionWithFeedback[]; className?: string }) {
  return (
    <Panel title="Recent activity" action={<SeeAll href="/inbox">See all</SeeAll>} className={className}>
      <ul className="-mx-2 flex flex-col">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item.decision.id}>
            <EmailLink
              id={item.decision.id}
              className="grid min-h-11 grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-hover"
            >
              <span className="text-xs tabular-nums text-muted-foreground">{when(item.decision.created_at)}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{didLine(item)}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.decision.subject || item.decision.sender}</span>
              </span>
              <StatusPill level={item.decision.autonomy_level} readOnly={wouldOnly(item.decision)} />
            </EmailLink>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
