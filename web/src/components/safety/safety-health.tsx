"use client";

import { EmailLink } from "@/components/email-link";
import { Panel } from "@/components/kit/panel";
import type { Decision, DecisionWithFeedback } from "@/lib/api";
import { reallyDone, safetyEvents, timeOf, within } from "@/lib/insights";
import { whatOscarDid } from "@/lib/labels";
import type { OscarData } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const DAYS = 30;

/** An email a safety check flagged, or that reading it closely showed was risky. */
const isRisky = (d: Decision) => d.safety_flags.length > 0 || d.level_source === "safety_check" || d.level_source === "model_check";

/** The real counts for the last 30 days. Nothing here is estimated. */
export function safetyHealth(data: OscarData, now = Date.now()) {
  const recent = within(data.items, DAYS, now);
  // Every decision, not only the latest on each email: an earlier read Oscar acted on still counts.
  const actedOn = new Map<string, DecisionWithFeedback>();
  for (const i of within(data.all, DAYS, now)) {
    if (isRisky(i.decision) && reallyDone(i) && !actedOn.has(i.decision.email_id)) actedOn.set(i.decision.email_id, i);
  }
  const pushed = new Set<string>();
  for (const i of data.all) {
    for (const f of i.feedback) {
      if (f.blocked_by_floor && now - new Date(f.created_at).getTime() <= DAYS * 86_400_000) pushed.add(f.id);
    }
  }
  return {
    emails: recent.length,
    stopped: safetyEvents(recent).length,
    actedOn: [...actedOn.values()].sort((a, b) => timeOf(b).localeCompare(timeOf(a))),
    pushed: pushed.size,
  };
}

function Row({ value, label, tone, children }: { value: number; label: string; tone?: "good" | "bad"; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "min-w-10 shrink-0 text-2xl font-bold tracking-tight tabular-nums",
          tone === "good" && "text-status-handled",
          tone === "bad" && "text-status-blocked",
        )}
      >
        {value.toLocaleString()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
        <span className="text-sm">{label}</span>
        {children && <span className="text-xs text-muted-foreground">{children}</span>}
      </div>
    </li>
  );
}

/** How the protections held up over the last 30 days, from Oscar's real decisions and your feedback. */
export function SafetyHealth({ data, readOnly }: { data: OscarData; readOnly: boolean }) {
  const h = safetyHealth(data);
  const acted = h.actedOn.length;
  return (
    <Panel
      title={
        <>
          Safety health <span className="font-normal text-muted-foreground">(last {DAYS} days)</span>
        </>
      }
    >
      <ul className="flex flex-col divide-y">
        <Row value={h.stopped} label={readOnly ? "risky emails he would have stopped and brought to you" : "risky emails stopped and brought to you"} />
        <Row value={acted} label="risky emails Oscar acted on" tone={acted ? "bad" : "good"}>
          {acted > 0 ? (
            <>
              This should never happen. Please look at {acted === 1 ? "it" : "each one"}:{" "}
              {h.actedOn.map((i, n) => (
                <span key={i.decision.id}>
                  {n > 0 && ", "}
                  <EmailLink id={i.decision.id} className="font-medium text-status-blocked underline underline-offset-4">
                    {whatOscarDid(i.decision, i.done)}: {i.decision.subject || "(no subject)"}
                  </EmailLink>
                </span>
              ))}
            </>
          ) : readOnly ? (
            "He only reads your Gmail right now, so he can't act on any email."
          ) : (
            "None, as it should be."
          )}
        </Row>
        <Row value={h.pushed} label="times you tried to teach him past a safety rule">
          {h.pushed > 0 ? "He kept the rule each time, and didn't learn from it." : null}
        </Row>
      </ul>
      <p className="text-xs text-muted-foreground">
        {h.emails === 0
          ? `No emails in the last ${DAYS} days yet.`
          : `Out of ${h.emails.toLocaleString()} ${h.emails === 1 ? "email" : "emails"} in the last ${DAYS} days.`}
      </p>
    </Panel>
  );
}
