"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OscarMood, type OscarPose } from "@/components/oscar-mood";
import { lastAnswerFor, sameAsLast } from "@/components/review/answer";
import { controlsFor, DecisionControls } from "@/components/review/decision-controls";
import { filtersFor, listFor, newSenders, priority, type FilterKey } from "@/components/review/filters";
import { FollowUp } from "@/components/review/follow-up";
import { GradeButtons, KeysHint, YouSaid } from "@/components/review/grade";
import { ReviewCard } from "@/components/review/review-card";
import { ReviewList } from "@/components/review/review-list";
import { Button } from "@/components/ui/button";
import { sendReview, type DecisionWithFeedback, type ReviewInput } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { isOldWay, toGrade, wouldOnly } from "@/lib/labels";
import { setHash, useHash } from "@/lib/use-hash";
import { isOpen, notifyChanged, oscarSays, type useOscar } from "@/lib/use-oscar";

type Feedback = ReturnType<typeof useOscar>["feedback"];

const newest = (a: DecisionWithFeedback, b: DecisionWithFeedback) => timeOf(b).localeCompare(timeOf(a));
const stopsFirst = (a: DecisionWithFeedback, b: DecisionWithFeedback) =>
  Number(b.decision.autonomy_level === "ESCALATE") - Number(a.decision.autonomy_level === "ESCALATE") || newest(a, b);

/**
 * What's left to go through, one at a time. Demo inbox: what he asked about or stopped, still
 * unanswered, stops first. Real inbox: anything waiting on a yes or no (once he acts), then every
 * call you haven't checked, the ones that teach him most first and old half-answers last.
 */
function queueOf(items: DecisionWithFeedback[], real: boolean, firstSeen: Set<string>) {
  const open = items.filter(isOpen).sort(stopsFirst);
  if (!real) return open;
  const grade = items.filter((i) => toGrade(i) && !isOpen(i)).sort((a, b) => priority(a, firstSeen) - priority(b, firstSeen) || newest(a, b));
  return [...open, ...grade];
}

/** Everything the progress bar counts: on the demo inbox his asks and stops, on the real one every call. */
const inScope = (i: DecisionWithFeedback, real: boolean) =>
  real || ((i.decision.autonomy_level === "ASK_FIRST" || i.decision.autonomy_level === "ESCALATE") && !wouldOnly(i.decision));

/** Oscar's pose and words above the email. Each one says something true about it. */
function moodFor(item: DecisionWithFeedback): { pose: OscarPose; title: string } {
  const d = item.decision;
  if (d.source === "gmail") {
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

function Progress({ done, total, onSeeAll }: { done: number; total: number; onSeeAll: () => void }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 sm:gap-2.5">
      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground sm:text-sm">
        <span>Review</span>
        <span className="flex items-center gap-3">
          <span className="tabular-nums">
            {done.toLocaleString()} of {total.toLocaleString()}
          </span>
          <button type="button" onClick={onSeeAll} className="-my-3 min-h-11 font-semibold text-foreground underline-offset-4 hover:underline">
            See all
          </button>
        </span>
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

function Mood({ pose, title }: { pose: OscarPose; title: string }) {
  return (
    <div className="flex items-center gap-3 sm:gap-3.5">
      <OscarMood pose={pose} size={80} className="size-16 sm:size-20" />
      <h1 className="text-lg font-bold tracking-[-0.015em] sm:text-[22px]" aria-live="polite">
        {title}
      </h1>
    </div>
  );
}

/**
 * Review, one email at a time: a progress bar, Oscar asking how he did, the email with his call,
 * and two big answers. "Not quite" swaps the email for what he should have done. "See all" (#all)
 * shows every email with the old tabs; picking one opens it here (#id), so the back button works.
 * Keys: Y right, N not quite (real inbox), J and K to move, Escape to go back.
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
  /** These are emails from your Gmail, not the demo inbox. */
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
  const queue = useMemo(() => queueOf(items, real, firstSeen).filter((i) => !answered.has(i.decision.id)), [items, real, firstSeen, answered]);
  const total = items.filter((i) => inScope(i, real)).length;
  const left = queue.filter((i) => inScope(i, real)).length;

  // The tabs in See all, kept here so J and K follow the tab you opened an email from.
  const filters = useMemo(() => filtersFor({ real, readOnly }), [real, readOnly]);
  const [chosen, setChosen] = useState<FilterKey>(() => (queue.length ? "needs" : "all"));
  const filter = filters.find((f) => f.key === chosen) ?? filters[0];
  const list = useMemo(() => listFor(items, filter, firstSeen), [items, filter, firstSeen]);

  const picked = !listView && hash ? items.find((i) => i.decision.id === hash) : undefined;
  const current = listView ? undefined : (picked ?? queue[0]);
  const id = current?.decision.id;
  const inQueue = !!current && queue.some((i) => i.decision.id === id);
  const nav = inQueue || !current ? queue : list.some((i) => i.decision.id === id) ? list : queue;

  // "fix" is the Not quite follow-up; "change" re-asks about an email you've answered. Per email.
  const [mode, setMode] = useState<{ id: string; mode: "fix" | "change" } | null>(null);
  const step = mode && mode.id === id ? mode.mode : "ask";
  const [busy, setBusy] = useState(false);
  // A moment of Oscar's reaction to the answer you just gave.
  const [flash, setFlash] = useState<{ pose: OscarPose; title: string } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  // Start each email, and the follow-up, at the top: after "Save and next" you're at the bottom of the page.
  const at = `${hash}:${id}:${step}`;
  const seen = useRef(at);
  useEffect(() => {
    if (seen.current !== at) window.scrollTo({ top: 0 });
    seen.current = at;
  }, [at]);

  const go = useCallback(
    (by: 1 | -1) => {
      const at = current ? nav.findIndex((i) => i.decision.id === current.decision.id) : -1;
      const next = at === -1 ? (by === 1 ? nav.find((i) => i.decision.id !== id) : undefined) : nav[at + by];
      if (next) setHash(next.decision.id);
    },
    [current, nav, id],
  );

  /** On to the next one, leaving this one behind. */
  const next = useCallback(() => {
    if (!current) return;
    const at = nav.findIndex((i) => i.decision.id === current.decision.id);
    const after = nav.slice(at + 1).find((i) => i.decision.id !== current.decision.id) ?? (inQueue ? undefined : queue.find((i) => i.decision.id !== current.decision.id));
    setAnswered((s) => new Set(s).add(current.decision.id));
    setMode(null);
    setHash(after?.decision.id ?? "");
  }, [current, nav, inQueue, queue]);

  const save = useCallback(
    async (input: ReviewInput, reaction?: { pose: OscarPose; title: string }) => {
      if (busy) return;
      setBusy(true);
      try {
        await sendReview(input);
        notifyChanged();
        if (reaction) setFlash(reaction);
        next();
      } catch (e) {
        oscarSays(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [busy, next],
  );

  const gradeable = !!current && real && current.decision.source === "gmail";
  const fresh = gradeable && !current.review;
  const old = gradeable && isOldWay(current.review);
  const asking = gradeable && (fresh || step === "change");
  const right = useCallback(
    () => current && save({ decision_id: current.decision.id, label: "CORRECT" }, { pose: "proud", title: "Thanks! Glad I got that one right." }),
    [current, save],
  );

  // Keys: J / K to move, Y right and N not quite on the real inbox. Not while typing, and not in the follow-up.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest("input, textarea, select, [contenteditable]")) return;
      if (listView || step === "fix") return;
      const key = e.key.toLowerCase();
      if (key === "j") go(1);
      else if (key === "k") go(-1);
      else if (key === "y" && asking) right();
      else if (key === "n" && (asking || old) && current) setMode({ id: current.decision.id, mode: "fix" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listView, step, go, asking, old, right, current]);

  if (listView) {
    return (
      <ReviewList
        items={items}
        list={list}
        filters={filters}
        filter={filter}
        onFilter={setChosen}
        stats={stats}
        onBack={() => setHash("")}
      />
    );
  }

  const progress = <Progress done={total - left} total={total} onSeeAll={() => setHash("all")} />;

  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        {progress}
        {doneState(total)}
      </div>
    );
  }

  if (step === "fix") {
    return (
      <FollowUp
        key={id}
        item={current}
        onBack={() => setMode(null)}
        onSaved={() => {
          setFlash({ pose: "learning", title: "Thanks! That helps me learn." });
          next();
        }}
      />
    );
  }

  const mood = flash ?? moodFor(current);
  const controls = controlsFor(current);
  const last = asking ? lastAnswerFor(items, current) : null;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {progress}
      <Mood pose={mood.pose} title={mood.title} />

      <ReviewCard key={id} item={current} items={items}>
        {gradeable && controls.any && <DecisionControls item={current} canAct={canAct} feedback={feedback} />}
      </ReviewCard>

      {gradeable ? (
        asking ? (
          <GradeButtons
            busy={busy}
            last={last}
            onRight={right}
            onNotQuite={() => setMode({ id: current.decision.id, mode: "fix" })}
            onSkip={() => save({ decision_id: current.decision.id, label: "SKIP" })}
            onBack={step === "change" ? () => setMode(null) : undefined}
            onSameAsLast={() => last && save(sameAsLast(current.decision.id, last), { pose: "learning", title: "Thanks! That helps me learn." })}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {old && (
              <div className="flex flex-wrap gap-3">
                <Button className="h-14 flex-1 basis-0 text-[17px] font-bold" onClick={() => setMode({ id: current.decision.id, mode: "fix" })}>
                  Finish it
                </Button>
              </div>
            )}
            <YouSaid item={current} onChange={() => setMode({ id: current.decision.id, mode: old ? "fix" : "change" })} />
            <NextRow onNext={() => go(1)} more={nav.some((i) => i.decision.id !== id)} label={inQueue ? "Skip for now" : "Next email"} />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {controls.any ? (
            <DecisionControls
              big
              item={current}
              canAct={canAct}
              feedback={feedback}
              onAnswered={(kind) => {
                // Answering an ask or a stop moves on; "Looks good" and undo stay on the email.
                if (inQueue && (kind === "APPROVE" || kind === "REJECT" || kind === "SEEN")) next();
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing here needs you.</p>
          )}
          <NextRow onNext={() => go(1)} more={nav.some((i) => i.decision.id !== id)} label={inQueue ? "Skip for now" : "Next email"} />
        </div>
      )}
    </div>
  );
}

/** Moving on without answering. */
function NextRow({ onNext, more, label }: { onNext: () => void; more: boolean; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-muted-foreground">
      {more ? (
        <button type="button" onClick={onNext} className="min-h-11 hover:text-foreground">
          {label}
        </button>
      ) : (
        <span />
      )}
      <KeysHint teaches={false} />
    </div>
  );
}
