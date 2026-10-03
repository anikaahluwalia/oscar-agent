"use client";

import { ExternalLinkIcon } from "lucide-react";
import { ReviewPanel } from "@/components/review-panel";
import { SenderAvatar } from "@/components/review/sender-avatar";
import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { ACTIONS } from "@/lib/labels";
import { safetyChecks, whatItIs } from "@/lib/insights";
import { Checklist } from "@/components/kit/checklist";
import { gmailLink, previewOf } from "@/lib/text";
import { dayLabel, formatTime } from "@/lib/time";

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

/** One email in the review workspace: the email, Oscar's decision and why, and your answer. */
export function DecisionPanel({ item }: { item: DecisionWithFeedback }) {
  const { decision } = item;
  const link = gmailLink(decision);
  const preview = previewOf(decision);
  const what = whatItIs(decision);
  // The first note names the sender and the last is the outcome; both are already shown.
  const reasons = decision.steps.slice(1, -1);
  return (
    <article className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-card">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SenderAvatar sender={decision.sender} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{decision.sender}</p>
            <p className="text-sm text-muted-foreground">
              {dayLabel(decision.gmail?.received_at ?? decision.created_at)}, {formatTime(decision.gmail?.received_at ?? decision.created_at)}
            </p>
          </div>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" aria-label="Open in Gmail" className="rounded-full p-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
              <ExternalLinkIcon className="size-4" />
            </a>
          )}
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-balance">{decision.subject}</h2>
        {preview && <p className="line-clamp-3 text-sm text-muted-foreground">{preview}</p>}
      </header>

      <section className="flex flex-col gap-3 border-t pt-5" aria-label="Oscar's decision">
        <div className="flex items-center justify-between gap-3">
          <Label>Oscar&apos;s decision</Label>
          <button type="button" onClick={() => openWhy(decision.id)} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Why this decision?
          </button>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
          <StatusPill level={decision.autonomy_level} className="px-3 py-1 text-sm" />
          <span className="font-medium">{ACTIONS[decision.action]}</span>
          {item.done && (
            <span className="ml-auto text-xs text-muted-foreground">{item.done.undone_at ? "Undone in Gmail" : "Done in Gmail"}</span>
          )}
        </div>
        {what && (
          <p className="text-sm">
            <span className="text-muted-foreground">What this is: </span>
            {what}
            {decision.understood_by === "model" && <span className="text-muted-foreground"> (read by the model)</span>}
          </p>
        )}
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="flex flex-col gap-2" aria-label="Reasoning">
          <Label>Reasoning</Label>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-2" aria-label="Safety checks">
          <Label>Safety checks</Label>
          <Checklist items={safetyChecks(decision)} />
        </section>
      </div>

      <section className="flex flex-col gap-2 border-t pt-5" aria-label="Your answer">
        <Label>Your answer</Label>
        <ReviewPanel key={decision.id} item={item} />
        <p className="text-xs text-muted-foreground">Each answer grades Oscar and teaches him about this sender.</p>
      </section>
    </article>
  );
}
