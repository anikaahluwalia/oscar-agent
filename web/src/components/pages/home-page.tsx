"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { ActivityRow } from "@/components/activity-row";
import { ChatPanel } from "@/components/chat-panel";
import { EmptyState } from "@/components/empty-state";
import { OscarStatusHeader } from "@/components/oscar-status-header";
import { Loading, Page, Section } from "@/components/page";
import { answerLine, DOES } from "@/components/preference-card";
import { StatusSummary } from "@/components/status-summary";
import { Button } from "@/components/ui/button";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { ACTIONS } from "@/lib/labels";
import { answersFor, countsOf, useOscar } from "@/lib/use-oscar";

function More({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      {children} <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

export function HomePage() {
  const { data, error } = useOscar();
  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const counts = countsOf(data.items);
  // Most evidence first: the habits Oscar is surest about.
  const known = [...data.learned].sort((a, b) => b.yes + b.no - (a.yes + a.no)).slice(0, 3);
  // What Oscar will actually do, after the protected rules, not just what feedback says.
  const levelOf = (sender: string, action: string) => data.autonomy.find((r) => r.sender === sender && r.action === action)?.level;

  return (
    <Page>
      <div className="flex flex-col gap-5">
        <OscarStatusHeader items={data.items} brief={data.brief} realInbox={data.gmail.connected} />
        {data.items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusSummary counts={counts} readOnly={data.gmail.connected} />
            {data.gmail.connected && (
              <Button variant="outline" size="sm" className="rounded-full" onClick={checkGmail}>
                Check for new email
              </Button>
            )}
          </div>
        )}
      </div>

      {data.items.length === 0 ? (
        data.gmail.connected ? (
          <EmptyState title="Nothing read yet." text="Oscar only reads your inbox. Nothing in Gmail changes.">
            <Button onClick={checkGmail}>Check for new email</Button>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing new yet." text="Connect Gmail in Settings, or try Oscar on a set of example emails.">
            <Button onClick={bringInDemo}>Bring in the demo emails</Button>
          </EmptyState>
        )
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-8">
            <Section title="Recent activity" link={<More href="/activity">View all</More>}>
              <ul className="flex flex-col rounded-2xl border bg-card p-1.5">
                {data.items.slice(0, 5).map((i) => (
                  <ActivityRow key={i.decision.id} decision={i.decision} />
                ))}
              </ul>
            </Section>

            <Section title="What Oscar knows" link={<More href="/memory">View all preferences</More>}>
              {known.length ? (
                <ul className="grid gap-3 sm:grid-cols-3">
                  {known.map((row) => (
                    <li key={`${row.sender}-${row.action}`} className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
                      <p className="truncate text-sm font-medium">{row.sender}</p>
                      <p className="text-sm text-muted-foreground">
                        {ACTIONS[row.action]} · {row.always_ask ? "always asks you" : DOES[levelOf(row.sender, row.action) ?? "ASK_FIRST"].toLowerCase()}
                      </p>
                      <p className="mt-auto pt-2 text-sm text-muted-foreground">{answerLine(answersFor(data.all, row.sender, row.action))}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  Nothing yet. Approve or undo a few things and I&apos;ll start picking up your habits.
                </p>
              )}
            </Section>
          </div>

          <aside className="flex flex-col gap-3 self-start rounded-2xl border bg-card p-5 lg:sticky lg:top-8">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Talk to Oscar</h2>
              <p className="text-sm text-muted-foreground">Ask what needs you, what I handled, or teach me a rule.</p>
            </div>
            <ChatPanel variant="compact" />
          </aside>
        </div>
      )}
    </Page>
  );
}
