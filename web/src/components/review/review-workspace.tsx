"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ShieldIcon } from "lucide-react";
import { OscarMood, type OscarPose } from "@/components/oscar-mood";
import { lastAnswerFor, sameAsLast } from "@/components/review/answer";
import { DecisionPanel } from "@/components/review/decision-panel";
import { filtersFor, listFor, newSenders, priority, type FilterKey } from "@/components/review/filters";
import { FollowUp } from "@/components/review/follow-up";
import { offersLikeThis } from "@/components/kit/like-this";
import { KeysHint } from "@/components/review/grade";
import { ReviewCard } from "@/components/review/review-card";
import { ReviewList } from "@/components/review/review-list";
import { SafetyPanel } from "@/components/review/safety-panel";
import { sendFeedback, sendReview, type DecisionWithFeedback, type FeedbackKind, type ReviewInput } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { isOldWay, isSafetyStop, toGrade, wouldOnly, yesOrNo } from "@/lib/labels";
import { setHash, useHash } from "@/lib/use-hash";
import { isOpen, notifyChanged, oscarSays, type useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";
import { isRule } from "@/components/inbox/decision-facts";

type Feedback = ReturnType<typeof useOscar>["feedback"];

const newest = (a: DecisionWithFeedback, b: DecisionWithFeedback) => timeOf(b).localeCompare(timeOf(a));
const stopsFirst = (a: DecisionWithFeedback, b: DecisionWithFeedback) =>
  Number(b.decision.autonomy_level === "ESCALATE") - Number(a.decision.autonomy_level === "ESCALATE") || newest(a, b);

type Mode = "regular" | "safety";

/**
 * What's left to go through, one at a time. Demo inbox: what he asked about or stopped, still
 * unanswered, stops first. Real inbox: anything waiting on a yes or no (once he acts), then every
 * call you haven't checked, the ones that teach him most first and old half-answers last.
 * Emails a safety rule stopped go to Safety review instead (safetyQueueOf).
 */
function queueOf(items: DecisionWithFeedback[], real: boolean, firstSeen: Set<string>) {
  items = items.filter((i) => !isSafetyStop(i.decision));
  const open = items.filter(isOpen).sort(stopsFirst);
  if (!real) return open;
  const grade = items
    .filter((i) => toGrade(i) && !isOpen(i) && !byYourRule(i))
    .sort((a, b) => priority(a, firstSeen) - priority(b, firstSeen) || newest(a, b));
  return [...open, ...grade];
}

/**
 * His call came from a rule you set ("just handle promotions", a six-month habit you said yes to):
 * you've already said what you want for emails like it, so it isn't one of the calls to check. After
 * you set a rule his calls on recent emails are redone (oscar/inbox.py rethink), so these drop out.
 */
const byYourRule = (i: DecisionWithFeedback) => i.decision.level_source === "learned" && isRule(i.decision);

/** What a safety rule stopped that you haven't answered in Safety review, newest first. */
const safetyQueueOf = (items: DecisionWithFeedback[]) =>
  items.filter((i) => isSafetyStop(i.decision) && !i.safety_review).sort(newest);

/** Everything the progress bar counts: on the demo inbox his asks and stops, on the real one every call. */
const inScope = (i: DecisionWithFeedback, real: boolean, mode: Mode) =>
  mode === "safety"
    ? isSafetyStop(i.decision)
    : !isSafetyStop(i.decision) &&
      (real || ((i.decision.autonomy_level === "ASK_FIRST" || i.decision.autonomy_level === "ESCALATE") && !wouldOnly(i.decision)));

/** Oscar's pose and words above the email. Each one says something true about it. */
function moodFor(item: DecisionWithFeedback): { pose: OscarPose; title: string } {
  const d = item.decision;
  if (yesOrNo(d)) {
    const r = item.review;
    if (isOpen(item) && d.autonomy_level === "ESCALATE") return { pose: "guarding", title: "I stopped this one. Did I get it right?" };
    if (!r || isOldWay(r)) return { pose: "thinking", title: "Did I get this one right?" };
    if (r.label === "CORRECT") return { pose: "proud", title: "You said I got this one right!" };
    if (r.label === "SKIP") return { pose: "thinking", title: "You weren't sure about this one." };
    return { pose: "learning", title: "You showed me what to do here." };
  }
  const said = (k: string) => item.feedback.some((f) => f.kind === k);
  if (isOpen(item)) {
    return d.autonomy_level === "ESCALATE"
      ? { pose: "guarding", title: "I stopped this one. Can you take a look?" }
      : { pose: "asking", title: "Can I go ahead with this one?" };
  }
  if (d.autonomy_level === "ESCALATE") return { pose: "guarding", title: "I stopped this one, and you've seen it." };
  if (said("UNDO") || said("REJECT")) return { pose: "learning", title: "You showed me what you'd do here." };
  if (said("APPROVE")) return { pose: "proud", title: "You said this was fine!" };
  return { pose: "done", title: "Here's what I did with this one." };
}

function Progress({ done, total, ruled = 0, onSeeAll }: { done: number; total: number; ruled?: number; onSeeAll: () => void }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] text-muted-foreground sm:text-sm">
        {ruled > 0 && (
          <span className="mr-auto">
            {ruled.toLocaleString()} {ruled === 1 ? "email" : "emails"} left out: your rules already decide {ruled === 1 ? "it" : "them"}
          </span>
        )}
        <span className="tabular-nums">
          {done.toLocaleString()} of {total.toLocaleString()}
        </span>
        <button type="button" onClick={onSeeAll} className="-my-3 min-h-11 font-semibold text-foreground underline-offset-4 hover:underline">
          See all
        </button>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done.toLocaleString()} of ${total.toLocaleString()} reviewed`}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const SUBTITLE: Record<Mode, string> = {
  regular: "Teach me by reviewing the emails I handled. Your feedback helps me make better decisions next time.",
  safety: "Check the emails a safety rule stopped. Your answers help me read them, but never relax a safety rule.",
};

/** Oscar, the page title, and a line about this kind of review (or his reaction to your last answer). */
function Header({ pose, mode, reaction, children }: { pose: OscarPose; mode: Mode; reaction: string | null; children: React.ReactNode }) {
  return (
    <header className="flex items-start gap-4">
      <OscarMood pose={pose} size={88} className="size-16 sm:size-[88px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.03em] sm:text-[34px]">Review</h1>
        <p className="text-[15px] text-muted-foreground" aria-live="polite">
          {reaction ?? SUBTITLE[mode]}
        </p>
        <div className="pt-2">{children}</div>
      </div>
    </header>
  );
}

/** Regular review or Safety review, with how many are left in each. */
function Tabs({ mode, counts, onChange }: { mode: Mode; counts: Record<Mode, number>; onChange: (m: Mode) => void }) {
  const tabs: { key: Mode; label: string; icon?: typeof ShieldIcon }[] = [
    { key: "regular", label: "Regular" },
    { key: "safety", label: "Safety", icon: ShieldIcon },
  ];
  return (
    <div role="tablist" aria-label="Kind of review" className="flex rounded-full border bg-muted/50 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={mode === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            mode === t.key && "bg-primary text-primary-foreground shadow-card hover:text-primary-foreground",
          )}
        >
          {t.icon && <t.icon className="size-4" aria-hidden />}
          {/* "Regular review" and "Safety review", shortened on a phone so each fits on one line. */}
          <span>
            {t.label}
            <span className="max-sm:hidden"> review</span>
          </span>
          {counts[t.key] > 0 && <span className="tabular-nums opacity-70">{counts[t.key].toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Review, one email at a time, in two columns: the email on the left, and on the right a panel that
 * stays in view while you scroll it. Regular review asks whether the action was right and, apart from
 * that, how much to involve you next time; Safety review only asks whether a stopped email's risk was
 * read right. "No" opens what he should have done in the panel. "See all" (#all) shows every email
 * with the old tabs; picking one opens it here (#id), so the back button works.
 * Keys: Y yes and N no (regular, real inbox), J and K to move, Escape to go back.
 */
export function ReviewWorkspace({
  items,
  real,
  readOnly,
  canAct,
  feedback,
  stats,
  done: doneState,
}: {
  items: DecisionWithFeedback[];
  /** Reviewed the way your real inbox is, with Yes or No on every call: your Gmail, or the demo. */
  real: boolean;
  /** Oscar only reads your Gmail. */
  readOnly: boolean;
  /** Oscar acts in Gmail. */
  canAct: boolean;
  feedback: Feedback;
  /** The line about how reviewing is going. */
  stats: React.ReactNode;
  /** What to show when nothing's left, given the totals. */
  done: (total: number) => React.ReactNode;
}) {
  const hash = useHash();
  const listView = hash === "all";
  const firstSeen = useMemo(() => newSenders(items), [items]);
  // Answered here, so they leave the queue at once instead of when the data comes back.
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());
  const queues = useMemo(
    () => ({
      regular: queueOf(items, real, firstSeen).filter((i) => !answered.has(i.decision.id)),
      safety: safetyQueueOf(items).filter((i) => !answered.has(i.decision.id)),
    }),
    [items, real, firstSeen, answered],
  );

  // The tabs in See all, kept here so J and K follow the tab you opened an email from.
  const filters = useMemo(() => filtersFor({ real, readOnly }), [real, readOnly]);
  const [chosen, setChosen] = useState<FilterKey>(() => (queues.regular.length ? "needs" : "all"));
  const filter = filters.find((f) => f.key === chosen) ?? filters[0];
  const list = useMemo(() => listFor(items, filter, firstSeen), [items, filter, firstSeen]);

  const picked = !listView && hash ? items.find((i) => i.decision.id === hash) : undefined;
  // An email opened from the list goes to the review it belongs to.
  const [tab, setTab] = useState<Mode>(() => (!queues.regular.length && queues.safety.length ? "safety" : "regular"));
  const mode: Mode = picked ? (isSafetyStop(picked.decision) ? "safety" : "regular") : tab;
  const queue = queues[mode];
  const total = items.filter((i) => inScope(i, real, mode)).length;
  const left = mode === "safety" ? queue.length : queue.filter((i) => inScope(i, real, mode)).length;

  const current = listView ? undefined : (picked ?? queue[0]);
  const id = current?.decision.id;
  // Kept open after a Yes, so you can still say how much to involve you before moving on.
  const [held, setHeld] = useState<string | null>(null);
  const inQueue = !!current && (queue.some((i) => i.decision.id === id) || held === id);
  const nav = inQueue || !current ? queue : list.some((i) => i.decision.id === id) ? list : queue;

  // "fix" is what he should have done, after a No; "change" re-asks about an email you've answered. Per email.
  const [step, setStep] = useState<{ id: string; mode: "fix" | "change" } | null>(null);
  const stepNow = step && step.id === id ? step.mode : "ask";
  const [busy, setBusy] = useState(false);
  // A moment of Oscar's reaction to the answer you just gave.
  const [flash, setFlash] = useState<{ pose: OscarPose; title: string } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  // Start each email at the top: after an answer you may be at the bottom of the page.
  const at = `${hash}:${id}:${stepNow}`;
  const seen = useRef(at);
  useEffect(() => {
    if (seen.current !== at) window.scrollTo({ top: 0 });
    seen.current = at;
  }, [at]);

  // The emails you've been through on this visit, newest last, so Back can return to one you just
  // answered: answered emails leave the queue, so "previous in the queue" isn't where you were.
  const [trail, setTrail] = useState<string[]>([]);
  const leave = useCallback(() => {
    if (id) setTrail((t) => (t.at(-1) === id ? t : [...t, id]));
  }, [id]);

  const go = useCallback(
    (by: 1 | -1) => {
      const at = current ? nav.findIndex((i) => i.decision.id === current.decision.id) : -1;
      if (by === -1 && at <= 0) {
        // Nothing before this one in the list: back to the email you were on before it.
        const before = trail.at(-1);
        if (before) {
          setTrail((t) => t.slice(0, -1));
          setHash(before);
        }
        return;
      }
      const next = at === -1 ? (by === 1 ? nav.find((i) => i.decision.id !== id) : undefined) : nav[at + by];
      if (next) {
        if (by === 1) leave();
        setHash(next.decision.id);
      }
    },
    [current, nav, id, trail, leave],
  );

  /** On to the next one, leaving this one behind. */
  const next = useCallback(() => {
    if (!current) return;
    const at = nav.findIndex((i) => i.decision.id === current.decision.id);
    const after = nav.slice(at + 1).find((i) => i.decision.id !== current.decision.id) ?? (inQueue ? undefined : queue.find((i) => i.decision.id !== current.decision.id));
    setAnswered((s) => new Set(s).add(current.decision.id));
    setStep(null);
    setHeld(null);
    leave();
    setHash(after?.decision.id ?? "");
  }, [current, nav, inQueue, queue, leave]);

  const save = useCallback(
    async (input: ReviewInput, reaction?: { pose: OscarPose; title: string }, stay = false) => {
      if (busy) return;
      setBusy(true);
      try {
        await sendReview(input);
        notifyChanged();
        if (reaction) setFlash(reaction);
        if (!stay) next();
      } catch (e) {
        oscarSays(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [busy, next],
  );

  const gradeable = !!current && real && yesOrNo(current.decision);
  const fresh = gradeable && !current.review;
  const old = gradeable && isOldWay(current.review);
  const asking = gradeable && (fresh || stepNow === "change");
  // "Yes" says the action was right, and nothing about how much to ask. When there's a "how much"
  // to answer, the email stays open for it; otherwise it's on to the next one.
  const right = useCallback(async () => {
    if (!current) return;
    const stay = offersLikeThis(current.decision);
    if (stay) {
      setHeld(current.decision.id);
      setHash(current.decision.id); // keep this email open when the answer comes back
    }
    await save({ decision_id: current.decision.id, label: "CORRECT" }, { pose: "proud", title: "Thanks! Glad I got that one right." }, stay);
    setStep(null);
  }, [current, save]);
  const involve = useCallback(
    async (kind: FeedbackKind) => {
      if (!current) return;
      setBusy(true);
      try {
        const { reply } = await sendFeedback(current.decision.id, kind);
        oscarSays(reply);
        notifyChanged();
        setFlash({ pose: "learning", title: "Got it. I'll remember how much to involve you." });
      } catch (e) {
        oscarSays(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
      // Once you've said both whether the action was right and how much to involve you, move on.
      const graded = !gradeable || current.review || held === current.decision.id;
      if (graded) next();
    },
    [current, gradeable, held, next],
  );

  // Keys: J / K to move, Y yes and N no in regular review of the real inbox. Not while typing, and not in the follow-up.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest("input, textarea, select, [contenteditable], [role=menu]")) return;
      if (listView || stepNow === "fix") return;
      const key = e.key.toLowerCase();
      if (key === "j") go(1);
      else if (key === "k") go(-1);
      else if (mode === "regular" && key === "y" && asking) right();
      else if (mode === "regular" && key === "n" && (asking || old) && current) setStep({ id: current.decision.id, mode: "fix" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listView, stepNow, go, asking, old, right, current, mode]);

  if (listView) {
    return (
      <div className="mx-auto w-full max-w-[744px]">
        <ReviewList items={items} list={list} filters={filters} filter={filter} onFilter={setChosen} stats={stats} onBack={() => setHash("")} />
      </div>
    );
  }

  const switchTo = (m: Mode) => {
    setTab(m);
    setStep(null);
    setHeld(null);
    if (hash) setHash("");
  };
  const counts = { regular: queues.regular.length, safety: queues.safety.length };
  const ruled = mode === "regular" && real ? items.filter((i) => toGrade(i) && !isOpen(i) && !isSafetyStop(i.decision) && byYourRule(i)).length : 0;
  const progress = <Progress done={total - left} total={total} ruled={ruled} onSeeAll={() => setHash("all")} />;
  const tabs = <Tabs mode={mode} counts={counts} onChange={switchTo} />;
  const mood = flash ?? (current ? moodFor(current) : { pose: "sleeping" as OscarPose, title: "" });

  if (!current) {
    return (
      <div data-tour="review-done" className="mx-auto flex w-full max-w-[744px] flex-col gap-6">
        <Header pose="sleeping" mode={mode} reaction={null}>
          {progress}
        </Header>
        {tabs}
        {mode === "safety" ? (
          <p className="rounded-3xl border bg-card px-6 py-8 text-center text-muted-foreground shadow-card">
            Nothing a safety rule stopped is waiting on you. {counts.regular > 0 && "There are still emails in Regular review."}
          </p>
        ) : (
          doneState(total)
        )}
      </div>
    );
  }

  const position = nav.findIndex((i) => i.decision.id === id);
  const where = inQueue ? `Email ${Math.min(total - left + 1, total).toLocaleString()} of ${total.toLocaleString()}` : position >= 0 ? `Email ${position + 1} of ${nav.length}` : "From your list";
  const last = asking ? lastAnswerFor(items, current) : null;
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 border-t pt-4 text-sm text-muted-foreground">
      {nav.some((i) => i.decision.id !== id) ? (
        <button type="button" onClick={held === id ? next : () => go(1)} className="min-h-11 font-semibold text-foreground hover:underline underline-offset-4">
          {held === id ? "Next email" : inQueue ? "Skip for now" : "Next email"}
        </button>
      ) : (
        <span />
      )}
      <KeysHint teaches={false} />
    </div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:gap-8">
      <div data-tour="review-email" className="flex min-w-0 flex-col gap-5">
        <Header pose={mood.pose} mode={mode} reaction={flash?.title ?? null}>
          {progress}
        </Header>
        <nav aria-label="Move between emails" className="flex items-center justify-between gap-3 rounded-full border bg-card p-1.5">
          <button
            type="button"
            aria-label="Previous email"
            disabled={position <= 0 && !trail.length}
            onClick={() => go(-1)}
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-hover disabled:opacity-40"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <span className="text-sm text-muted-foreground tabular-nums">{where}</span>
          <button
            type="button"
            aria-label="Next email"
            disabled={!nav.some((i, n) => n > position && i.decision.id !== id)}
            onClick={() => go(1)}
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-hover disabled:opacity-40"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </nav>
        <ReviewCard key={id} item={current} items={items} call={false} />
      </div>

      <aside
        aria-label={mode === "safety" ? "Safety review" : "Your review"}
        data-tour="review-answer"
        className="flex min-w-0 flex-col gap-5 rounded-3xl border bg-card p-5 shadow-card lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain"
      >
        {tabs}
        {stepNow === "fix" ? (
          <FollowUp
            key={id}
            item={current}
            onBack={() => setStep(null)}
            onSaved={() => {
              setFlash({ pose: "learning", title: "Thanks! That helps me learn." });
              next();
            }}
          />
        ) : mode === "safety" ? (
          <SafetyPanel key={id} item={current} onAnswered={next} footer={footer} />
        ) : (
          <DecisionPanel
            key={id}
            item={current}
            real={real}
            canAct={canAct}
            feedback={feedback}
            busy={busy}
            asking={asking}
            last={last}
            onYes={() => void right()}
            onNo={() => setStep({ id: current.decision.id, mode: "fix" })}
            onSkip={() => void save({ decision_id: current.decision.id, label: "SKIP" })}
            onSameAsLast={() => last && void save(sameAsLast(current.decision.id, last), { pose: "learning", title: "Thanks! That helps me learn." })}
            onChange={() => setStep({ id: current.decision.id, mode: old ? "fix" : "change" })}
            onInvolve={(kind) => void involve(kind)}
            onNext={next}
            onAnswered={(kind) => {
              // Approve, Decline, Mark as reviewed and Looks good (also an APPROVE) move on; Undo stays on the email.
              if (inQueue && (kind === "APPROVE" || kind === "REJECT" || kind === "SEEN")) next();
            }}
            footer={footer}
          />
        )}
      </aside>
    </div>
  );
}
