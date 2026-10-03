"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { ChatPanel } from "@/components/chat-panel";
import { DecisionCard } from "@/components/decision-card";
import { EmptyState } from "@/components/empty-state";
import { OscarStatusHeader } from "@/components/oscar-status-header";
import { Loading, Page, Section } from "@/components/page";
import { SinceYesterday } from "@/components/since-yesterday";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback } from "@/lib/api";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { isOldWay, needsReview } from "@/lib/labels";
import { isOpen, useOscar, type OscarData } from "@/lib/use-oscar";

const TOP = 5; // what needs you, before "see all"

function More({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
      {children} <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

/** What's waiting on you, most urgent first: what he stopped, then what he asked about.
 * On the real inbox (read-only), his calls to check, then old reviews to finish. */
function waiting(data: OscarData): DecisionWithFeedback[] {
  if (data.gmail.connected) {
    const calls = data.items.filter(needsReview);
    return [...calls.filter((i) => !isOldWay(i.review)), ...calls.filter((i) => isOldWay(i.review))];
  }
  const open = data.items.filter(isOpen);
  return [...open.filter((i) => i.decision.autonomy_level === "ESCALATE"), ...open.filter((i) => i.decision.autonomy_level === "ASK_FIRST")];
}

export function HomePage() {
  const { data, error, feedback } = useOscar();
  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const readOnly = data.gmail.connected;
  const needs = waiting(data);

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <OscarStatusHeader items={data.items} brief={data.brief} realInbox={readOnly} />
        {readOnly && (
          <Button variant="outline" className="rounded-full" onClick={checkGmail}>
            Check now
          </Button>
        )}
      </div>

      {data.items.length === 0 ? (
        readOnly ? (
          <EmptyState title="Nothing read yet." text="Oscar only reads your inbox. Nothing in Gmail changes.">
            <Button onClick={checkGmail}>Check now</Button>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing new yet." text="Connect Gmail in Settings, or try Oscar on a set of example emails.">
            <Button onClick={bringInDemo}>Bring in the demo emails</Button>
          </EmptyState>
        )
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-8">
            {needs.length > 0 && (
              <Section
                title={readOnly ? "Calls to check" : "Needs you"}
                link={needs.length > TOP && <More href="/review">See all {needs.length.toLocaleString()}</More>}
              >
                <ul className="flex flex-col gap-3">
                  {needs.slice(0, TOP).map((item) => (
                    <li key={item.decision.id}>
                      <DecisionCard compact item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Since yesterday" link={<More href="/email">All email</More>}>
              <SinceYesterday items={data.items} readOnly={readOnly} />
            </Section>
          </div>

          <aside className="flex flex-col gap-3 self-start rounded-2xl border bg-card p-5 shadow-card lg:sticky lg:top-8">
            <h2 className="text-lg font-semibold">Ask Oscar</h2>
            <ChatPanel variant="compact" />
          </aside>
        </div>
      )}
    </Page>
  );
}
