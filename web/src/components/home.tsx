"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmailRow } from "@/components/email-row";
import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import type { DecisionWithFeedback, Level } from "@/lib/api";
import { LEVELS } from "@/lib/labels";
import { API_DOWN, isAnswered, isDone, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

function inboxMood(items: DecisionWithFeedback[]): Mood {
  const waiting = items.filter((i) => !isAnswered(i));
  if (waiting.some((i) => i.decision.autonomy_level === "ESCALATE")) return "alert";
  if (waiting.some((i) => i.decision.autonomy_level === "ASK_FIRST")) return "curious";
  return items.length ? "happy" : "calm";
}

// A few squares around Oscar, like the confetti on wajo.ai.
const CONFETTI = [
  "left-0 top-3 bg-level-silent",
  "right-1 top-0 bg-level-notify",
  "-right-2 bottom-6 bg-level-ask",
  "left-3 bottom-0 bg-level-escalate",
];

function Section({ level, title, items, children }: { level: Level; title: string; items: number; children: React.ReactNode }) {
  if (!items) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className={cn("size-2 rounded-[2px]", LEVELS[level].square)} aria-hidden />
        {title} <span className="text-xs">({items})</span>
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pb-16">
      <section className="flex flex-col items-center gap-5 pt-6 text-center sm:flex-row sm:items-center sm:text-left">
        <div className="relative p-4">
          {CONFETTI.map((c) => (
            <span key={c} className={cn("absolute size-2.5 rounded-[2px]", c)} aria-hidden />
          ))}
          <OscarAvatar size={112} mood={error ? "calm" : inboxMood(items)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {loading ? "Checking your inbox..." : error ? "I can't reach my API." : data?.brief.summary}
          </h1>
          {error && <p className="text-sm text-muted-foreground">{API_DOWN.replace("I can't reach my API. ", "")}</p>}
          {data?.brief.trend && <p className="text-muted-foreground">{data.brief.trend}</p>}
          {data?.brief.learned && (
            <p className="text-muted-foreground">
              {data.brief.learned}{" "}
              <Link href="/autonomy" className="underline underline-offset-4 hover:text-foreground">See what I do on my own</Link>
            </p>
          )}
          {!!data?.brief.waiting && (
            <Button asChild className="mt-2 self-center sm:self-start">
              <Link href="/triage">Go through {data.brief.waiting} with me</Link>
            </Button>
          )}
        </div>
      </section>

      {data && (
        <>
          <Section level="ESCALATE" title="For you" items={of("ESCALATE").length}>{rows(of("ESCALATE"))}</Section>
          <Section level="ASK_FIRST" title="Waiting for your okay" items={of("ASK_FIRST").length}>{rows(of("ASK_FIRST"))}</Section>
          <Section level="PROCEED_AND_NOTIFY" title="Told you" items={of("PROCEED_AND_NOTIFY").length}>{rows(of("PROCEED_AND_NOTIFY"))}</Section>
          {done > 0 && (
            <Link
              href="/activity"
              className="rounded-2xl border border-dashed p-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {done} {done === 1 ? "email is" : "emails are"} done, handled by me or answered by you. See them in Activity
            </Link>
          )}
        </>
      )}
    </main>
  );
}
