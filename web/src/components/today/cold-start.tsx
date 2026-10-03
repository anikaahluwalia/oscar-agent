"use client";

import { useCallback, useEffect, useState } from "react";
import { OscarMood } from "@/components/oscar-mood";
import { Button } from "@/components/ui/button";
import {
  answerHabit,
  finishColdStart,
  getColdStart,
  skipColdStart,
  startColdStart,
  type ColdStart as Status,
  type Habit,
  type HabitChoice,
} from "@/lib/api";
import { familyName } from "@/lib/labels";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const PHASES: Record<NonNullable<Status["phase"]>, string> = {
  fetching: "Fetching email",
  understanding: "Understanding patterns",
  finding: "Finding habits",
  ready: "Ready to review",
};

const CHOICES: { choice: HabitChoice; label: string }[] = [
  { choice: "handle", label: "Just handle them" },
  { choice: "tell", label: "Handle + tell me" },
  { choice: "ask", label: "Keep asking" },
  { choice: "reject", label: "Not a useful pattern" },
];

const SAID: Record<HabitChoice, string> = {
  handle: "I'll just handle these. Anything risky still comes to you.",
  tell: "I'll handle these and tell you.",
  ask: "I'll keep asking about these.",
  reject: "Got it, I won't use this one.",
};

/** "You archived 42 of 46 similar emails", from what he counted (never more than that). */
function evidence(h: Habit) {
  const of = `${h.count.toLocaleString()} of ${h.emails.toLocaleString()} similar emails`;
  const did = h.habit === "archived" ? `You archived ${of}` : h.habit === "read" ? `You read and kept ${of}` : `You left ${of} in your inbox`;
  return `${did}, from ${h.senders.toLocaleString()} senders.`;
}

/** What he'd do from now on if you say so. */
function suggestion(h: Habit) {
  if (h.habit === "archived") return "Archive these from now on?";
  if (h.habit === "read") return "Mark these as read from now on, and keep them?";
  return "Leave these in your inbox?";
}

/** The status, every couple of seconds while he's looking, so the count moves. */
function useColdStart() {
  const [status, setStatus] = useState<Status | null>(null);
  const load = useCallback(() => getColdStart().then(setStatus, () => setStatus(null)), []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (status?.state !== "running") return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [status?.state, load]);
  return [status, setStatus] as const;
}

/**
 * Learning from your last six months, the first time Gmail is connected (oscar/cold_start.py): his
 * progress while he looks, then the few clearest habits, each with what he should do from now on.
 * What you did before is only evidence: nothing changes until you answer. Gone once you're done.
 */
export function ColdStart() {
  const [status, setStatus] = useColdStart();
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<Status>, after?: (s: Status) => void) {
    setBusy(true);
    try {
      const next = await work();
      setStatus(next);
      after?.(next);
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!status || ["unavailable", "complete", "skipped"].includes(status.state)) return null;

  const skip = (
    <Button variant="ghost" className="h-10 rounded-full px-4 text-muted-foreground" disabled={busy} onClick={() => void run(skipColdStart)}>
      {status.state === "ready" ? "Skip the rest" : "Skip, start fresh"}
    </Button>
  );

  if (status.state === "not_started" || status.state === "failed") {
    return (
      <Card pose="thinking" title="Want me to learn from your inbox?">
        <p className="text-[15px] text-muted-foreground">
          {status.state === "failed"
            ? status.error
            : "I can look at the last 6 months to see how you usually handle each kind of email, then check with you before I use any of it. I only read; nothing in Gmail changes."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button className="h-10 rounded-full px-5 font-semibold" disabled={busy} onClick={() => void run(startColdStart)}>
            {status.state === "failed" ? "Try again" : "Look at my last 6 months"}
          </Button>
          {skip}
        </div>
      </Card>
    );
  }

  if (status.state === "running") {
    const total = status.discovered;
    const done = status.phase === "fetching" ? 0 : status.processed;
    return (
      <Card pose="learning" title="Oscar is learning your inbox">
        <p className="text-[15px] text-muted-foreground">Looking at the last 6 months... I only read, so nothing in Gmail changes.</p>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{status.phase ? PHASES[status.phase] : "Starting"}</span>
            <span className="text-muted-foreground tabular-nums">
              {status.phase === "fetching"
                ? `${total.toLocaleString()} emails found`
                : `${done.toLocaleString()} / ${total.toLocaleString()} emails analyzed`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: total ? `${Math.max(2, (done / total) * 100)}%` : "2%" }} />
          </div>
        </div>
        <div>{skip}</div>
      </Card>
    );
  }

  // Ready: the habits to answer.
  const open = status.candidates.filter((h) => !status.answers[h.id]);
  return (
    <Card pose="reporting" title={status.candidates.length ? "Here's what I noticed" : "No clear habits yet"}>
      <p className="text-[15px] text-muted-foreground">
        {status.candidates.length
          ? `I looked at ${status.processed.toLocaleString()} emails from the last 6 months. These are evidence, not permission: tell me what to do from now on. Anything risky still comes to you.`
          : `I looked at ${status.processed.toLocaleString()} emails and didn't find anything clear enough. I'll learn from your answers as we go.`}
      </p>
      {status.candidates.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {status.candidates.map((h) => (
            <HabitCard key={h.id} habit={h} said={status.answers[h.id]} busy={busy}
              onAnswer={(choice) => void run(() => answerHabit(h.id, choice), () => { oscarSays(SAID[choice]); notifyChanged(); })} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {status.candidates.length === 0 || !open.length ? (
          <Button className="h-10 rounded-full px-5 font-semibold" disabled={busy} onClick={() => void run(finishColdStart)}>
            Done
          </Button>
        ) : (
          skip
        )}
      </div>
    </Card>
  );
}

function Card({ pose, title, children }: { pose: "thinking" | "learning" | "reporting"; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-[24px] border bg-card px-5 py-5 sm:flex-row sm:gap-6 sm:px-6">
      <OscarMood pose={pose} size={84} className="shrink-0 self-start" />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h2 className="text-[19px] font-bold tracking-[-0.01em]">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function HabitCard({ habit: h, said, busy, onAnswer }: { habit: Habit; said?: HabitChoice; busy: boolean; onAnswer: (c: HabitChoice) => void }) {
  return (
    <li className="flex flex-col gap-3 rounded-[20px] border bg-background/40 p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-[15px] font-bold">{familyName(h.kind)}</p>
        <p className="text-sm text-muted-foreground">{evidence(h)}</p>
        <p className="text-sm">{suggestion(h)} What should I do going forward?</p>
      </div>
      {said ? (
        <p className="text-[13px] font-semibold text-muted-foreground">You said: {CHOICES.find((c) => c.choice === said)?.label}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {CHOICES.filter((c) => h.options.includes(c.choice)).map((c) => (
            <Button
              key={c.choice}
              variant={c.choice === "reject" ? "ghost" : "outline"}
              className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold", c.choice === "reject" && "text-muted-foreground")}
              disabled={busy}
              onClick={() => onAnswer(c.choice)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
