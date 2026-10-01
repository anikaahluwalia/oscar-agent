"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Chat } from "@/components/chat";
import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import { SwipeDeck } from "@/components/swipe-deck";
import type { DecisionWithFeedback } from "@/lib/api";
import { bringInDemo } from "@/lib/demo";
import { API_DOWN, isDone, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

function inboxMood(open: DecisionWithFeedback[], total: number): Mood {
  if (open.some((i) => i.decision.autonomy_level === "ESCALATE")) return "alert";
  if (open.length) return "curious";
  return total ? "sleepy" : "calm"; // nothing left for you, so Oscar naps
}

// A few squares around Oscar, like the confetti on wajo.ai.
const CONFETTI = [
  "left-0 top-3 bg-level-silent",
  "right-1 top-0 bg-level-notify",
  "-right-2 bottom-6 bg-level-ask",
  "left-3 bottom-0 bg-level-escalate",
];

export function Home() {
  const { data, error, loading } = useOscar();
  const items = data?.items ?? [];
  const open = items.filter((i) => !isDone(i));
  const done = items.length - open.length;
  // The first sentence is the headline ("6 emails need you."); the rest goes underneath.
  const [headline, ...rest] = (data?.brief.summary ?? "").split(/(?<=\.) /);

  return (
    <main className="flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 pt-8 pb-16 sm:px-10">
      <section className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="relative shrink-0 p-4">
          {CONFETTI.map((c) => (
            <span key={c} className={cn("absolute size-2.5 rounded-[2px]", c)} aria-hidden />
          ))}
          <OscarAvatar size={96} mood={error ? "calm" : inboxMood(open, items.length)} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {loading ? "Checking your inbox..." : error ? "I can't reach my API." : headline}
          </h1>
          {data && rest.length > 0 && <p className="text-lg">{rest.join(" ")}</p>}
          {error && <p className="text-muted-foreground">{API_DOWN.replace("I can't reach my API. ", "")}</p>}
          {data?.brief.trend && <p className="text-muted-foreground">{data.brief.trend}</p>}
          {data?.brief.learned && (
            <p className="text-muted-foreground">
              {data.brief.learned}{" "}
              <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">See what I do on my own</Link>
            </p>
          )}
          {data && items.length === 0 && (
            <Button className="mt-1 self-start" onClick={bringInDemo}>Bring in the demo emails</Button>
          )}
        </div>
      </section>

      {data && (
        <>
          <SwipeDeck />
          <Chat items={items} />
          {done > 0 && (
            <Link href="/activity" className="rounded-3xl bg-card p-4 text-muted-foreground hover:text-foreground">
              {done} {done === 1 ? "email is" : "emails are"} done, handled by me or answered by you. See them in Activity
            </Link>
          )}
        </>
      )}
    </main>
  );
}
