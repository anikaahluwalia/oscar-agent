"use client";

import { EmailLink } from "@/components/email-link";
import { StatusPill } from "@/components/status-pill";
import type { Decision } from "@/lib/api";
import { whatOscarDid } from "@/lib/labels";
import { formatTime } from "@/lib/time";

/** One thing Oscar did. Opens the email in the inbox. */
export function ActivityRow({ decision }: { decision: Decision }) {
  return (
    <li>
      <EmailLink
        id={decision.id}
        className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 rounded-xl px-4 py-3 hover:bg-surface-hover sm:grid-cols-[4.5rem_1fr_auto]"
      >
        <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">{formatTime(decision.created_at)}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{decision.sender}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {whatOscarDid(decision)} · {decision.subject}
          </span>
        </span>
        <StatusPill level={decision.autonomy_level} readOnly={decision.source === "gmail"} />
      </EmailLink>
    </li>
  );
}
