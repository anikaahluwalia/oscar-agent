"use client";

import { useEffect, useState } from "react";
import { Loading, Page } from "@/components/page";
import { AlsoWaiting } from "@/components/today/also-waiting";
import { TellOscar } from "@/components/today/tell-oscar";
import { TodayHeader } from "@/components/today/today-header";
import { TookCare } from "@/components/today/took-care";
import { WaitingCard } from "@/components/today/waiting-card";
import { say, startOfToday, tookCare } from "@/components/today/words";
import { Button } from "@/components/ui/button";
import { handledSince, plural, waiting } from "@/lib/counts";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { isReadOnly, useOscar } from "@/lib/use-oscar";

/** The time now, updated every minute, so "today" stays right past midnight. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const Frame = ({ children }: { children: React.ReactNode }) => (
  <Page className="sm:pt-12">
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 sm:gap-9">{children}</div>
  </Page>
);

export function TodayPage() {
  const { data, error, feedback } = useOscar();
  const now = useNow();
  // Which waiting email the card shows. Kept by id, so new email coming in doesn't move it;
  // once it's answered and gone, the one after it takes its place.
  const [pick, setPick] = useState<{ id: string; at: number } | null>(null);

  if (!data) {
    return (
      <Frame>
        <Loading error={error} />
      </Frame>
    );
  }

  const readOnly = isReadOnly(data);
  const checkNow = data.gmail.connected && (
    <Button variant="outline" className="h-11 self-start rounded-full px-5 sm:h-10 sm:self-center" onClick={checkGmail}>
      Check now
    </Button>
  );

  if (data.items.length === 0) {
    return (
      <Frame>
        {data.gmail.connected ? (
          <TodayHeader pose="sleeping" title="Nothing read yet." text="I check your inbox every few minutes, or press Check now.">
            {checkNow}
          </TodayHeader>
        ) : (
          <TodayHeader pose="sleeping" title="Nothing here yet." text="Connect Gmail in Settings, or try me on a set of example emails.">
            <Button className="h-11 self-start rounded-full px-5 sm:h-10 sm:self-center" onClick={bringInDemo}>
              Bring in the demo emails
            </Button>
          </TodayHeader>
        )}
        <TellOscar />
      </Frame>
    );
  }

  const needs = waiting(data);
  const found = pick ? needs.findIndex((i) => i.decision.id === pick.id) : 0;
  const at = found >= 0 ? found : Math.min(pick?.at ?? 0, needs.length - 1);
  const current = needs[at];
  const moveTo = (to: number) => setPick({ id: needs[to].decision.id, at: to });

  const today = startOfToday(now);
  const handled = handledSince(data, today);
  const chips = tookCare(data.items, today, readOnly);

  // Guarding only for something he really held back; while he only reads, nothing was held.
  const stopped = !readOnly && needs.some((i) => i.decision.autonomy_level === "ESCALATE");
  const pose = !needs.length ? "sleeping" : stopped ? "guarding" : "asking";
  const title = !needs.length
    ? readOnly
      ? "All quiet. You've checked all my calls!"
      : "All quiet. Nothing needs you."
    : readOnly
      ? `${say(needs.length, "call", "calls")} to check.`
      : `${say(needs.length, "thing", "things")} for you.`;
  const text = readOnly
    ? `${handled ? `I'd have taken care of ${plural(handled, "email", "emails")} today.` : "Nothing I'd handle on my own came in today."} I only read Gmail for now, so nothing changed in it.`
    : handled
      ? `I took care of ${plural(handled, "email", "emails")} today. You can undo any of them.`
      : "I haven't taken care of anything yet today.";

  return (
    <Frame>
      <TodayHeader pose={pose} title={title} text={text}>
        {checkNow}
      </TodayHeader>

      {current && (
        <WaitingCard
          key={current.decision.id}
          item={current}
          items={data.items}
          index={at}
          total={needs.length}
          readOnly={readOnly}
          onMove={moveTo}
          onFeedback={(k) => feedback(current.decision.id, k)}
        />
      )}

      <AlsoWaiting items={needs.filter((i) => i !== current)} total={needs.length} readOnly={readOnly} />

      <TookCare chips={chips} readOnly={readOnly} />

      <TellOscar />
    </Frame>
  );
}
