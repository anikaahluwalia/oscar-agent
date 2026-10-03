"use client";

import { useEffect, useState } from "react";
import { usePermissions } from "@/components/kinds-of-email";
import { Loading, Page } from "@/components/page";
import { ActivityCard } from "@/components/today/activity-card";
import { ApproveActions } from "@/components/today/approve-actions";
import { CaughtUp } from "@/components/today/caught-up";
import { ChatCorner } from "@/components/today/chat-corner";
import { ColdStart } from "@/components/today/cold-start";
import { ComingUp } from "@/components/today/coming-up";
import { GmailPill } from "@/components/today/gmail-pill";
import { LearnedCard } from "@/components/today/learned-card";
import { NeedsYou } from "@/components/today/needs-you";
import { TodayHeader } from "@/components/today/today-header";
import { activity, startOfToday } from "@/components/today/words";
import { Button } from "@/components/ui/button";
import { handledSince, plural, waiting } from "@/lib/counts";
import { bringInDemo } from "@/lib/demo";
import { greeting } from "@/lib/insights";
import { useLocalSetting } from "@/lib/local-setting";
import { isReadOnly, useOscar, type OscarData } from "@/lib/use-oscar";
import { isSafetyStop } from "@/lib/labels";

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
    {/* Room at the bottom so the last card scrolls clear of Oscar in the corner. */}
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 pb-28 sm:gap-8">{children}</div>
    <ChatCorner />
  </Page>
);

/** "Good evening, Sam!": your first name from Google, or the one you gave in Settings. */
function useHello(data: OscarData | null | undefined, now: number) {
  const [saved] = useLocalSetting("name", "");
  const name = data?.gmail.name?.split(" ")[0] || saved.trim();
  return `${greeting(new Date(now))}${name ? `, ${name}` : ""}!`;
}

/** "I handled 8 emails today. 2 need your attention." Only what's true. */
function summary(needs: number, handled: number, readOnly: boolean) {
  if (readOnly) {
    const would = handled ? `I'd have handled ${plural(handled, "email", "emails")} today, but I only read Gmail for now. ` : "";
    return needs ? `${would}${plural(needs, "call is", "calls are")} waiting for you to check.` : `${would}Nothing needs you right now.`;
  }
  const did = handled ? `I handled ${plural(handled, "email", "emails")} today. ` : "";
  if (!needs) return `${did}Nothing needs you right now.`;
  const need = needs === 1 ? "needs" : "need";
  return handled ? `${did}${needs.toLocaleString()} ${need} your attention.` : `${plural(needs, "email", "emails")} ${need} your attention.`;
}

export function TodayPage() {
  const { data, error, feedback } = useOscar();
  const { rows: rules } = usePermissions();
  const now = useNow();
  const hello = useHello(data, now);

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
        {data.gmail.connected && <ColdStart />}
      </Frame>
    );
  }

  // What needs you first, then today's work and what's coming. Nothing needing you is its own calm card.
  const needs = waiting(data);
  const today = startOfToday(now);
  const handled = handledSince(data, today);
  const stopped = !readOnly && needs.some((i) => isSafetyStop(i.decision));
  const pose = needs.length ? (stopped ? "guarding" : "asking") : handled ? "done" : "reporting";

  return (
    <Frame>
      <TodayHeader pose={pose} title={hello} text={summary(needs.length, handled, readOnly)}>
        <GmailPill gmail={data.gmail} now={now} />
      </TodayHeader>

      {data.gmail.connected && <ColdStart />}

      {needs.length ? <NeedsYou items={needs} canAct={!readOnly} onFeedback={feedback} /> : <CaughtUp readOnly={readOnly} />}

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <ActivityCard rows={activity(data.items, today, readOnly)} readOnly={readOnly} />
        <ComingUp items={data.items} now={now} />
      </div>

      {!needs.length && <ApproveActions learned={data.learned} items={data.items} onAnswer={(id, kind) => void feedback(id, kind)} />}
      <LearnedCard learned={data.learned} rules={rules} now={now} />
    </Frame>
  );
}
