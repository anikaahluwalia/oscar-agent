"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendReview, type Action, type DecisionWithFeedback, type Level, type Reason, type Review, type ReviewInput, type Why } from "@/lib/api";
import { ACTIONS, REVIEW_LABELS, isOldWay, whatOscarDid } from "@/lib/labels";
import { notifyChanged, oscarSays, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

// What he should have done, in your words. Mirrors oscar/review.py.
const LEVELS: { level: Level; label: string }[] = [
  { level: "PROCEED_SILENTLY", label: "Handled it quietly" },
  { level: "PROCEED_AND_NOTIFY", label: "Handled it and told me" },
  { level: "ASK_FIRST", label: "Asked me first" },
  { level: "ESCALATE", label: "Only told me, I'll deal with it" },
];

// What each level can be done with. Oscar never quietly replies, forwards or unsubscribes,
// and money and passwords always come straight to you, so those aren't offered.
const QUIET: Action[] = ["MARK_READ", "ARCHIVE", "APPLY_LABEL", "DRAFT_REPLY"];
const ASKED: Action[] = [...QUIET, "SEND_REPLY", "FORWARD", "UNSUBSCRIBE", "ACCEPT_MEETING", "PERMANENTLY_DELETE"];
const ACTIONS_FOR: Record<Level, Action[]> = {
  PROCEED_SILENTLY: QUIET,
  PROCEED_AND_NOTIFY: ["DRAFT_REPLY", "MARK_READ", "ARCHIVE", "APPLY_LABEL"],
  ASK_FIRST: ASKED,
  ESCALATE: [],
};
const QUESTION: Record<Level, string> = {
  PROCEED_SILENTLY: "What should he have done with it?",
  PROCEED_AND_NOTIFY: "What should he have done with it?",
  ASK_FIRST: "What should he have asked to do?",
  ESCALATE: "Why should this come to you?",
};

const REASONS: { reason: Reason; label: string }[] = [
  { reason: "SCAM", label: "Looks like a scam" },
  { reason: "MONEY", label: "Asks for money" },
  { reason: "CREDENTIALS", label: "Asks for a password or code" },
  { reason: "ACCOUNT_SECURITY", label: "About my account's security" },
  { reason: "SENSITIVE_DATA", label: "Has personal info" },
  { reason: "COMMITMENT", label: "Commits me to something" },
  { reason: "PROMPT_INJECTION", label: "Has instructions aimed at Oscar" },
  { reason: "IMPORTANT", label: "It's just important to me" },
];
const risky = (reasons: Reason[]) => reasons.some((r) => r !== "IMPORTANT");
const ACTED: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"];

/**
 * Would Oscar's choice pass this answer? Mirrors expected_answer and grade_answer in oscar/review.py:
 * "only tell me, it's just important" passes asking or stopping it; "ask me, I'll handle it" passes
 * any ask; a quiet "Other" passes nothing, since none of his actions was right.
 */
function passes(oscar: { autonomy_level: Level; action: Action }, level: Level, choice: Choice | null, reasons: Reason[]) {
  if (level === "ESCALATE" && reasons.length && !risky(reasons)) {
    return oscar.autonomy_level === "ASK_FIRST" || oscar.autonomy_level === "ESCALATE";
  }
  if (oscar.autonomy_level !== level) return false;
  if (level === "ESCALATE") return true;
  if (choice === "OTHER") return false;
  if (choice === "NOTHING" || choice === null) return level === "ASK_FIRST";
  return choice === oscar.action;
}

const WHY: { why: Why; label: string }[] = [
  { why: "preference", label: "Yes, I'd just handle it differently" },
  { why: "misread", label: "No, it's actually a…" },
  { why: "risk", label: "He missed that it's risky" },
];

// Kinds of email, for "he misread what this is".
const TYPES = [
  "Promo or marketing",
  "Newsletter",
  "Receipt or order",
  "Job or recruiter",
  "Personal",
  "Work or school",
  "Bill or payment",
  "Account or security",
];

type Choice = Action | "NOTHING" | "OTHER";

/** A full answer in a few words: "Mark as read, quietly", "Only tell me: asks for money". */
export function describeAnswer(level: Level, action: Action | null, reasons: Reason[] = []): string {
  if (level === "ESCALATE") {
    const why = REASONS.filter((r) => reasons.includes(r.reason)).map((r) => r.label.toLowerCase());
    return `Only tell me${why.length ? `: ${why.join(", ")}` : ""}`;
  }
  if (!action) return level === "ASK_FIRST" ? "Ask me, I'll handle it" : "Something else";
  const how = { PROCEED_SILENTLY: "quietly", PROCEED_AND_NOTIFY: "and tell me", ASK_FIRST: "after asking me" }[level];
  return `${ACTIONS[action]}, ${how}`;
}

function describeReview(review: Review): string {
  if (review.complete && review.should_be_level) {
    return describeAnswer(review.should_be_level, review.should_be_action, review.reasons);
  }
  const extra = [review.should_be_action && ACTIONS[review.should_be_action], review.actual_type].filter(Boolean);
  return [REVIEW_LABELS[review.label].label, ...extra].join(" · ");
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        selected && "border-transparent bg-foreground text-background hover:bg-foreground hover:text-background",
      )}
    >
      {children}
    </button>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}

/**
 * Scoring one of Oscar's decisions on the real inbox: "did he get it right?", and if not,
 * what he should have done: how much on his own, then what, then whether he understood
 * the email. That's the same answer the evals use. It grades him, and it teaches him about the sender.
 */
export function ReviewPanel({ item }: { item: DecisionWithFeedback }) {
  const { decision, review, answer: graded } = item;
  const { data } = useOscar();
  // Your most recent full "No", for "same as the last one".
  const last = (data?.items ?? [])
    .map((i) => i.review)
    .filter((r): r is Review => !!r && r.complete && r.label !== "CORRECT")
    .sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0];
  const [fixing, setFixing] = useState(false);
  const [level, setLevel] = useState<Level | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [why, setWhy] = useState<Why | null>(null);
  const [type, setType] = useState("");
  const [labelName, setLabelName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!review);

  function reset() {
    setFixing(false);
    setLevel(null);
    setChoice(null);
    setReasons([]);
    setWhy(null);
    setType("");
    setLabelName("");
    setNote("");
  }

  function startFixing() {
    reset();
    setFixing(true);
    // Finishing an old review: start from the half that was saved.
    if (isOldWay(review) && review) {
      if (review.should_be_level) setLevel(review.should_be_level);
      if (review.should_be_action) setChoice(review.should_be_action);
      if (review.actual_type) {
        setWhy("misread");
        setType(review.actual_type);
      }
      if (review.note) setNote(review.note);
    }
  }

  function pickLevel(next: Level) {
    setLevel(next);
    if (why === "risk" && next !== "ASK_FIRST") setWhy(null);
    // Keep the action if it still fits, so changing only the level is one tap.
    if (choice && choice !== "OTHER" && !(choice === "NOTHING" ? next === "ASK_FIRST" : ACTIONS_FOR[next].includes(choice))) {
      setChoice(null);
    }
    if (next !== "ESCALATE") setReasons([]);
  }

  async function save(input: ReviewInput) {
    setBusy(true);
    try {
      await sendReview(input);
      reset();
      setEditing(false);
      notifyChanged();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const action: Action | null = choice && choice !== "NOTHING" && choice !== "OTHER" ? choice : null;
  const autoRisk = level === "ESCALATE" && risky(reasons);
  const finalWhy: Why | null = autoRisk ? "risk" : why;
  const input = (): ReviewInput => ({
    decision_id: decision.id,
    should_be_level: level!,
    should_be_action: action,
    why: finalWhy,
    reasons: level === "ESCALATE" ? reasons : [],
    actual_type: finalWhy === "misread" ? type.trim() || null : null,
    label_name: action === "APPLY_LABEL" ? labelName.trim() || null : null,
    note: note.trim() || null,
  });

  const same = !!level && !(level !== "ESCALATE" && !choice) && passes(decision, level, choice, reasons);
  const missing = !level
    ? "Pick what he should have done."
    : level === "ESCALATE"
      ? reasons.length
        ? null
        : "Say why it should come to you."
      : !choice
        ? "Pick what he should have done with it."
        : choice === "OTHER" && !note.trim()
          ? "Say what he should have done."
          : null;
  const whyMissing = !missing && !finalWhy ? "Say whether he understood the email." : null;
  const typeMissing = finalWhy === "misread" && !type.trim() ? "Say what kind of email it is." : null;
  const sameHint = same && finalWhy !== "misread" && !note.trim() ? "That's what Oscar picked. Change something, or go back and press Yes." : null;
  const problem = missing ?? whyMissing ?? typeMissing ?? sameHint;

  // Your last full "No", offered again for emails like it. Not an "Other" (its note is about that
  // email), and not if it's what Oscar already picked here.
  const lastChoice: Choice | null = last?.should_be_action ?? (last?.should_be_level === "ASK_FIRST" ? "NOTHING" : null);
  const lastAnswer =
    last?.complete && last.should_be_level && last.decision_id !== decision.id &&
    !(ACTED.includes(last.should_be_level) && !last.should_be_action) &&
    !passes(decision, last.should_be_level, lastChoice, last.reasons)
      ? last
      : null;

  // Already reviewed: say what you said, with a way to change it.
  if (review && !editing) {
    // When your answer was on an earlier read: how this read does against it, compared with that one.
    const now = !graded?.from_earlier
      ? null
      : graded.error === "none"
        ? graded.earlier_error === "none"
          ? "Oscar still gets this right."
          : "Oscar gets this right now."
        : graded.earlier_error === "none"
          ? `Oscar now: ${whatOscarDid(decision).toLowerCase()}, which is different from what you said was right.`
          : `Oscar now: ${whatOscarDid(decision).toLowerCase()}, still not right.`;
    const plainYes = review.label === "CORRECT" && !review.complete;
    const said = review.label === "SKIP" ? "Not sure" : plainYes ? "Yes, that's right" : describeReview(review);
    const prefix = graded?.from_earlier ? "About an earlier read, you said" : "You said";
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-dashed px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            {plainYes || review.label === "SKIP" || isOldWay(review) ? `${prefix}: ` : `${prefix} he should: `}
            <span className="font-medium">{said}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              if (isOldWay(review)) startFixing();
            }}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {isOldWay(review) ? "Finish it" : "Change"}
          </button>
        </div>
        {now && <p className="text-xs text-muted-foreground">{now}</p>}
      </div>
    );
  }

  if (!fixing) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
        <p className="text-sm font-medium">Did Oscar get this right?</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => save({ decision_id: decision.id, label: "CORRECT" })}>
            Yes, that&apos;s right
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={startFixing}>
            No
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ decision_id: decision.id, label: "SKIP" })}>
            Not sure
          </Button>
          {review && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Back
            </Button>
          )}
        </div>
        {lastAnswer && lastAnswer.should_be_level && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              save({
                decision_id: decision.id,
                should_be_level: lastAnswer.should_be_level!,
                should_be_action: lastAnswer.should_be_action,
                why: lastAnswer.why,
                reasons: lastAnswer.reasons,
                actual_type: lastAnswer.actual_type,
                label_name: lastAnswer.label_name,
                note: null,
              })
            }
            className="self-start text-left text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            No, same as the last one: {describeAnswer(lastAnswer.should_be_level, lastAnswer.should_be_action, lastAnswer.reasons).toLowerCase()}
            {lastAnswer.why === "misread" && lastAnswer.actual_type && <>, he misread it (it&apos;s {lastAnswer.actual_type.toLowerCase()})</>}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-dashed p-4">
      <p className="text-xs text-muted-foreground">
        Oscar picked: <span className="text-foreground">{whatOscarDid(decision)}</span>
        {isOldWay(review) && review && <> · You said before: {describeReview(review)}</>}
      </p>

      <Question title="What should he have done?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              aria-pressed={level === l.level}
              onClick={() => pickLevel(l.level)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm hover:bg-surface-hover",
                level === l.level && "border-transparent bg-foreground text-background hover:bg-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Question>

      {level && (
        <Question title={QUESTION[level]}>
          <div className="flex flex-wrap gap-1.5">
            {level === "ESCALATE"
              ? REASONS.map((r) => (
                  <Chip
                    key={r.reason}
                    selected={reasons.includes(r.reason)}
                    onClick={() => setReasons((rs) => (rs.includes(r.reason) ? rs.filter((x) => x !== r.reason) : [...rs, r.reason]))}
                  >
                    {r.label}
                  </Chip>
                ))
              : (
                  <>
                    {ACTIONS_FOR[level].map((a) => (
                      <Chip key={a} selected={choice === a} onClick={() => setChoice(a)}>
                        {ACTIONS[a]}
                      </Chip>
                    ))}
                    {level === "ASK_FIRST" ? (
                      <Chip selected={choice === "NOTHING"} onClick={() => setChoice("NOTHING")}>
                        Nothing, I&apos;ll handle it
                      </Chip>
                    ) : (
                      <Chip selected={choice === "OTHER"} onClick={() => setChoice("OTHER")}>
                        Other
                      </Chip>
                    )}
                  </>
                )}
          </div>
          {action === "APPLY_LABEL" && (
            <input
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              placeholder="Which label? (optional)"
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          )}
        </Question>
      )}

      {level && !missing && !autoRisk && (
        <Question title="Did he understand what this email is?">
          <div className="flex flex-wrap gap-1.5">
            {WHY.filter((w) => w.why !== "risk" || level === "ASK_FIRST").map((w) => (
              <Chip key={w.why} selected={why === w.why} onClick={() => setWhy(w.why)}>
                {w.label}
              </Chip>
            ))}
          </div>
          {why === "misread" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <Chip key={t} selected={type === t} onClick={() => setType(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
              <input
                value={TYPES.includes(type) ? "" : type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Something else? Type it"
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
            </div>
          )}
        </Question>
      )}

      {level && (
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={choice === "OTHER" ? "What should he have done? (needed)" : "Anything else? (optional)"}
          className="min-h-14"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !!problem} onClick={() => save(input())}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            if (review) setEditing(false);
          }}
        >
          Back
        </Button>
        {problem && level && <p className="text-xs text-muted-foreground">{problem}</p>}
      </div>
    </div>
  );
}
