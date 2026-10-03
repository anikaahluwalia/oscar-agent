"use client";

import { useEffect, useState } from "react";
import { Loading, Page } from "@/components/page";
import { AlsoWaiting } from "@/components/today/also-waiting";
import { ApproveActions } from "@/components/today/approve-actions";
import { ComingUp } from "@/components/today/coming-up";
import { DidSummary } from "@/components/today/did-summary";
import { ChatCorner } from "@/components/today/chat-corner";
import { TodayHeader } from "@/components/today/today-header";
import { TookCare } from "@/components/today/took-care";
import { WaitingCard } from "@/components/today/waiting-card";
import { startOfToday, tookCare } from "@/components/today/words";
import { Button } from "@/components/ui/button";
import { handledSince, plural, waiting } from "@/lib/counts";
import { bringInDemo } from "@/lib/demo";
import { greeting } from "@/lib/insights";
import { useLocalSetting } from "@/lib/local-setting";
import { isReadOnly, useOscar, type OscarData } from "@/lib/use-oscar";

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
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6 sm:gap-9">{children}</div>
    <ChatCorner />
  </Page>
);

/** "Good evening, Sam!": your first name from Google, or the one you gave in Settings. */
function useHello(data: OscarData | null | undefined, now: number) {
  const [saved] = useLocalSetting("name", "");
  const name = data?.gmail.name?.split(" ")[0] || saved.trim();
  return `${greeting(new Date(now))}${name ? `, ${name}` : ""}!`;
}

/** "You have 3 emails to review, 51 taken care of today and 1 held back." Only what's true. */
function summary(waitingOn: number, handled: number, heldBack: number, readOnly: boolean) {
  const wait = waitingOn ? `You have ${plural(waitingOn, "email", "emails")} to review` : "Nothing needs you right now";
  if (readOnly) {
    const would = handled ? ` I'd have taken care of ${plural(handled, "email", "emails")} today, but I only read Gmail for now.` : "";
    return `${wait}.${would}`;
  }
  const rest = [handled && `${handled.toLocaleString()} taken care of today`, heldBack && `${heldBack.toLocaleString()} held back`].filter(Boolean);
  if (!rest.length) return `${wait}.`;
  if (waitingOn) return `${wait}, ${rest.join(" and ")}.`;
  // Nothing waiting: say it as Oscar would.
  return `${wait}. ${handled ? `I took care of ${plural(handled, "email", "emails")} today` : "I haven't had anything to do yet today"}${heldBack ? ` and held back ${heldBack.toLocaleString()}` : ""}.`;
}

export function TodayPage() {
  const { data, error, feedback } = useOscar();
  const now = useNow();
  const hello = useHello(data, now);
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

  if (data.items.length === 0) {
    return (
      <Frame>
        {data.gmail.connected ? (
          <TodayHeader
            pose="sleeping"
            title={hello}
            text={
              data.gmail.auto_check_minutes
                ? `Nothing read yet. I check your inbox every ${plural(data.gmail.auto_check_minutes, "minute", "minutes")} on my own.`
                : "Nothing read yet. Check your inbox from Settings."
            }
          />
        ) : (
          <TodayHeader pose="sleeping" title={hello} text="Nothing here yet. Connect Gmail in Settings, or try me on a set of example emails.">
            <Button className="h-11 self-start rounded-full px-5 sm:h-10 sm:self-center" onClick={bringInDemo}>
              Bring in the demo emails
            </Button>
          </TodayHeader>
        )}
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
  const heldBack = readOnly ? 0 : needs.filter((i) => i.decision.autonomy_level === "ESCALATE").length;
  const text = summary(needs.length, handled, heldBack, readOnly);

  if (!needs.length) {
    // Nothing needs you: a short briefing instead of an empty page.
    return (
      <Frame>
        <TodayHeader pose={pose} title={hello} text={text} />
        <ComingUp items={data.items} now={now} />
        <DidSummary chips={chips} readOnly={readOnly} />
        <ApproveActions learned={data.learned} items={data.items} onAnswer={(id, kind) => void feedback(id, kind)} />
      </Frame>
    );
  }

  return (
    <Frame>
      <TodayHeader pose={pose} title={hello} text={text} />

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

      <ComingUp items={data.items} now={now} />
    </Frame>
  );
}
