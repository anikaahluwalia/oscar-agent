"use client";

import Link from "next/link";
import { SmileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chat } from "@/components/chat";
import { EmailRow } from "@/components/email-row";
import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import { SwipeDeck } from "@/components/swipe-deck";
import type { DecisionWithFeedback, Level } from "@/lib/api";
import { bringInDemo } from "@/lib/demo";
import { LEVELS } from "@/lib/labels";
import { API_DOWN, isDone, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

function inboxMood(open: DecisionWithFeedback[], total: number): Mood {
  if (open.some((i) => i.decision.autonomy_level === "ESCALATE")) return "alert";
  if (open.some((i) => i.decision.autonomy_level === "ASK_FIRST")) return "curious";
  return total ? "sleepy" : "calm"; // nothing left for you, so Oscar naps
}

// A few squares around Oscar, like the confetti on wajo.ai.
const CONFETTI = [
  "left-0 top-3 bg-level-silent",
  "right-1 top-0 bg-level-notify",
  "-right-2 bottom-6 bg-level-ask",
  "left-3 bottom-0 bg-level-escalate",
];

function Section({ level, title, icon, children }: { level: Level; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
        <span className={cn("size-2.5 rounded-[2px]", LEVELS[level].square)} aria-hidden />
        {title}
        {icon}
      </h2>
      {children}
    </section>
  );
}

export function Home() {
  const { data, error, loading, feedback } = useOscar();
  const items = data?.items ?? [];
  const open = items.filter((i) => !isDone(i));
  const done = items.length - open.length;
  const of = (level: Level) => open.filter((i) => i.decision.autonomy_level === level);
  const rows = (list: DecisionWithFeedback[]) => (
    <ul className="flex flex-col gap-2">
      {list.map((item, index) => (
        <EmailRow key={item.decision.id} index={index} item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
      ))}
    </ul>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 pt-8 pb-16 sm:px-8">
      <section className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <div className="relative p-4">
          {CONFETTI.map((c) => (
            <span key={c} className={cn("absolute size-2.5 rounded-[2px]", c)} aria-hidden />
          ))}
          <OscarAvatar size={112} mood={error ? "calm" : inboxMood(open, items.length)} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {loading ? "Checking your inbox..." : error ? "I can't reach my API." : data?.brief.summary}
          </h1>
          {error && <p className="text-muted-foreground">{API_DOWN.replace("I can't reach my API. ", "")}</p>}
          {data?.brief.trend && <p className="text-muted-foreground">{data.brief.trend}</p>}
          {data?.brief.learned && (
            <p className="text-muted-foreground">
              {data.brief.learned}{" "}
              <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">See what I do on my own</Link>
            </p>
          )}
          {data && items.length === 0 && (
            <Button className="mt-1 self-center sm:self-start" onClick={bringInDemo}>Bring in the demo emails</Button>
          )}
        </div>
      </section>

      {data && (
        <>
          {of("ESCALATE").length > 0 && <Section level="ESCALATE" title={LEVELS.ESCALATE.label}>{rows(of("ESCALATE"))}</Section>}
          {of("ASK_FIRST").length > 0 && (
            <Section level="ASK_FIRST" title={LEVELS.ASK_FIRST.label} icon={<SmileIcon className="size-5 text-level-ask" />}>
              <SwipeDeck />
            </Section>
          )}
          {of("PROCEED_AND_NOTIFY").length > 0 && (
            <Section level="PROCEED_AND_NOTIFY" title={LEVELS.PROCEED_AND_NOTIFY.label}>{rows(of("PROCEED_AND_NOTIFY"))}</Section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
              <OscarAvatar size={24} /> Talk to Oscar
            </h2>
            <Chat items={items} />
          </section>

          {done > 0 && (
            <Link href="/activity" className="flex items-center gap-2 rounded-3xl bg-card p-4 text-sm text-muted-foreground hover:text-foreground">
              <span className={cn("size-2.5 rounded-[2px]", LEVELS.PROCEED_SILENTLY.square)} aria-hidden />
              <span className="font-medium text-foreground">{LEVELS.PROCEED_SILENTLY.label}</span>
              {done} {done === 1 ? "email is" : "emails are"} taken care of. See them in Activity
            </Link>
          )}
        </>
      )}
    </main>
  );
}
