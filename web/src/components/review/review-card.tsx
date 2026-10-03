"use client";

import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { Checklist } from "@/components/kit/checklist";
import { EmailContent } from "@/components/kit/email-preview";
import { addressOf, displayName, SenderAvatar } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import { OscarAvatar } from "@/components/oscar-avatar";
import { becauseOf, callLine, fromBefore, kindOf, smallPrint } from "@/components/review/call";
import type { DecisionWithFeedback } from "@/lib/api";
import { when } from "@/lib/counts";
import { openWhy } from "@/lib/drawers";
import { safetyChecks, timeOf } from "@/lib/insights";
import { STATUS } from "@/lib/labels";
import { gmailLink } from "@/lib/text";
import { cn } from "@/lib/utils";

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex min-h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground sm:min-h-7 sm:text-[13px]">{children}</span>;
}

/**
 * One email as Oscar saw it: who it's from, the email itself in a box you can scroll, and his
 * call on it in a line, with the reason under it.
 */
export function ReviewCard({ item, items, children }: { item: DecisionWithFeedback; items: DecisionWithFeedback[]; children?: React.ReactNode }) {
  const d = item.decision;
  const level = d.autonomy_level;
  const address = addressOf(d.sender);
  const kind = kindOf(item);
  const before = fromBefore(items, item);
  const because = becauseOf(item);
  const note = smallPrint(item);
  const link = gmailLink(d);
  const checks = safetyChecks(d);
  const found = checks.filter((c) => !c.ok).length;

  return (
    <article aria-label="The email" className="overflow-hidden rounded-3xl border bg-card shadow-card sm:rounded-[26px]">
      <header className="flex flex-col gap-2.5 border-b px-4 py-4 sm:px-[22px] sm:py-[18px]">
        <div className="flex items-center gap-3">
          <SenderAvatar sender={d.sender} size={40} />
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate">
              <b className="text-[15px] sm:text-sm">{displayName(d.sender)}</b>{" "}
              {address && <span className="hidden text-muted-foreground sm:inline">&lt;{address}&gt;</span>}
            </div>
            <div className="flex min-w-0 text-xs text-muted-foreground sm:text-sm">
              {address && <span className="min-w-0 truncate sm:hidden">{address}</span>}
              <span className="shrink-0 whitespace-pre">
                {address && <span className="sm:hidden"> · </span>}
                <span className="hidden sm:inline">to me · </span>
                {when(timeOf(item))}
              </span>
            </div>
          </div>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Gmail"
              className="-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          )}
        </div>
        {(kind || before > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {kind && <Tag>{kind}</Tag>}
            {before > 0 && <Tag>{before.toLocaleString()} from them before</Tag>}
          </div>
        )}
        <h2 className="text-lg leading-snug font-bold tracking-[-0.01em] text-pretty break-words">{d.subject || "(no subject)"}</h2>
      </header>

      <div className="max-h-[240px] overflow-y-auto border-b bg-muted/40 p-3 sm:max-h-[470px] sm:p-5">
        <EmailContent decision={d} />
        {d.source !== "gmail" && <p className="px-1 pt-3 text-xs text-muted-foreground">An example email. Oscar keeps only the start of each one.</p>}
      </div>

      <div className="flex flex-col gap-3 bg-surface-hover/40 px-4 py-4 sm:px-[22px]">
        <div className="flex items-start gap-3">
          <OscarAvatar size={34} mood={level === "ESCALATE" ? "alert" : level === "ASK_FIRST" ? "curious" : "calm"} className="shrink-0" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[15px] leading-normal sm:text-base">
              <StatusWords level={level} className="mr-1.5 align-[1px]">
                {STATUS[level].label}
              </StatusWords>
              {callLine(item)}
            </p>
            {because && <p className="text-[13px] text-muted-foreground">Because: {because}</p>}
            {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
            {d.summary && (
              <p className="text-[13px] text-muted-foreground">
                What I think it is: {d.summary}
                {d.understood_by === "model" && " (read by the model)"}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4">
              <button
                type="button"
                onClick={() => openWhy(d.id)}
                className="min-h-11 text-[13px] font-semibold underline-offset-4 hover:underline sm:min-h-8"
              >
                Why this call?
              </button>
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-[13px] font-semibold sm:min-h-8 [&::-webkit-details-marker]:hidden">
                  Safety checks
                  <span className={cn("font-normal", found ? "text-status-blocked" : "text-muted-foreground")}>{found ? `${found} found` : "nothing found"}</span>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <Checklist items={checks} className="pt-1 pb-2" />
              </details>
            </div>
          </div>
        </div>
        {children}
      </div>
    </article>
  );
}
