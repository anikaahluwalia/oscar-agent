"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { handledSince, waiting } from "@/lib/counts";
import { AskRate } from "@/components/home/ask-rate";
import { Impact } from "@/components/home/impact";
import { NeedsCard } from "@/components/home/needs-card";
import { RecentActivity, SeeAll } from "@/components/home/recent-activity";
import { OscarAvatar } from "@/components/oscar-avatar";
import { OscarStatusHeader } from "@/components/oscar-status-header";
import { Loading, Page, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { greeting, previousVisit } from "@/lib/insights";
import { useLocalSetting } from "@/lib/local-setting";
import { isReadOnly, useOscar } from "@/lib/use-oscar";

const TOP = 3; // cards for what needs you, before "see all"
const DAY = 86_400_000;

/** The time now, updated every minute, so "last 24 hours" and the greeting stay right. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function HomePage() {
  const { data, error, feedback } = useOscar();
  const [name] = useLocalSetting("name", "");
  // When you last had Oscar open on this device. Null the first time: then it's the last day.
  const [since] = useState(() => (typeof window === "undefined" ? null : previousVisit()));
  const now = useNow();

  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const readOnly = isReadOnly(data);
  const needs = waiting(data);

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <OscarStatusHeader
          greeting={greeting(new Date(now))}
          name={name}
          handled={handledSince(data, since ?? now - DAY)}
          away={since !== null}
          needs={needs}
          readOnly={readOnly}
        />
        {data.gmail.connected && (
          <Button variant="outline" className="h-11 px-5 sm:h-10" onClick={checkGmail}>
            Check now
          </Button>
        )}
      </div>

      {data.items.length === 0 ? (
        data.gmail.connected ? (
          <EmptyState title="Nothing read yet." text="Oscar checks your inbox every few minutes, or press Check now.">
            <Button onClick={checkGmail}>Check now</Button>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing new yet." text="Connect Gmail in Settings, or try Oscar on a set of example emails.">
            <Button onClick={bringInDemo}>Bring in the demo emails</Button>
          </EmptyState>
        )
      ) : (
        <>
          <Section
            title={readOnly ? "Calls to check" : "Needs you"}
            link={needs.length > TOP && <SeeAll href="/review">See all {needs.length.toLocaleString()}</SeeAll>}
          >
            {needs.length ? (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {needs.slice(0, TOP).map((item, i) => (
                  <li key={item.decision.id} className="flex">
                    <NeedsCard item={item} index={i} total={needs.length} onFeedback={(k) => feedback(item.decision.id, k)} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border bg-card p-5 shadow-card">
                <OscarAvatar size={36} mood="sleepy" />
                <p className="text-sm text-muted-foreground">
                  {readOnly ? "You've checked all my calls! I'll keep reading." : "All clear! I'll come get you if anything shows up."}
                </p>
              </div>
            )}
          </Section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <RecentActivity items={data.items} className="md:col-span-2 xl:col-span-1" />
            <AskRate items={data.items} readOnly={readOnly} />
            <Impact items={data.items} readOnly={readOnly} now={now} />
          </div>
        </>
      )}
    </Page>
  );
}
