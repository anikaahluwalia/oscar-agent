"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { displayName } from "@/components/kit/sender";
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

/** What each answer says, worded for the habit, so every button says what it will do. */
function choiceLabel(h: Habit, choice: HabitChoice) {
  const verb = h.habit === "read" ? "Mark read" : "Archive them";
  switch (choice) {
    case "handle":
      return h.habit === "read" ? "Mark read for me" : "Archive them for me";
    case "tell":
      return `${verb} and tell me`;
    case "label":
      return h.label_name ? `Label them “${h.label_name}”, keep in inbox` : "Label them, keep in inbox";
    case "ask":
      return h.habit === "kept" ? "Leave them to me" : "Ask me first";
    case "reject":
      return "Don't use this";
  }
}

const SAID: Record<HabitChoice, string> = {
  handle: "I'll take care of these. Anything risky still comes to you.",
  tell: "I'll take care of these and tell you.",
  label: "I'll label these and leave them in your inbox.",
  ask: "Got it, I'll leave these to you.",
  reject: "Got it, I won't use this one.",
};

/** The headline: what you did with them, from what he counted (never more than that). */
function evidence(h: Habit) {
  const of = <b className="font-bold text-foreground">{h.count.toLocaleString()}</b>;
  const total = h.emails.toLocaleString();
  if (h.habit === "archived") return <>You archived {of} of {total}</>;
  if (h.habit === "ignored") return <>You never opened {of} of {total}</>;
  if (h.habit === "read") return <>You read and kept {of} of {total}</>;
  return <>You kept {of} of {total} in your inbox</>;
}

/** The one question each habit asks. */
const QUESTION: Record<Habit["habit"], string> = {
  archived: "Archive these from now on?",
  ignored: "Archive these from now on?",
  read: "Mark these as read from now on, and keep them?",
  kept: "Label these and keep them in your inbox?",
};

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
  const pct = Math.round(h.share * 100);
  const examples = h.examples.map(displayName);
  return (
    <li className="flex flex-col gap-3.5 rounded-[20px] border bg-background/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-bold">{familyName(h.kind)}</p>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] text-muted-foreground">{evidence(h)}</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <p className="text-[13px] text-muted-foreground">
          {h.senders.toLocaleString()} {h.senders === 1 ? "sender" : "senders"}
          {examples.length > 0 && ` · e.g. ${examples.join(", ")}`}
        </p>
      </div>
      <div className="flex flex-col gap-2.5 border-t pt-3.5">
        <p className="text-sm font-semibold">{QUESTION[h.habit]}</p>
        {said ? (
          <p className="flex items-center gap-2 text-[13px] font-semibold text-status-handled">
            <CheckIcon className="size-4" aria-hidden /> {choiceLabel(h, said)}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {h.options.map((choice) => {
              const suggested = choice === h.suggested;
              return (
                <Button
                  key={choice}
                  variant={suggested ? "default" : choice === "reject" ? "ghost" : "outline"}
                  className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold", choice === "reject" && "text-muted-foreground")}
                  disabled={busy}
                  onClick={() => onAnswer(choice)}
                >
                  {choiceLabel(h, choice)}
                  {suggested && <span className="rounded-full bg-primary-foreground/15 px-1.5 text-[11px] font-medium">Suggested</span>}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
