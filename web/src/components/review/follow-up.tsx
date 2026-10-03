"use client";

import { useEffect, useState } from "react";
import { displayName } from "@/components/kit/sender";
import { OscarMood } from "@/components/oscar-mood";
import {
  ACTIONS_FOR,
  chipName,
  describeReview,
  fits,
  LEVELS,
  passes,
  QUESTION,
  REASONS,
  risky,
  TYPES,
  WHY,
  type Choice,
} from "@/components/review/answer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendReview, type Action, type DecisionWithFeedback, type Level, type Reason, type ReviewInput, type Why } from "@/lib/api";
import { isOldWay, whatOscarDid } from "@/lib/labels";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-surface-hover",
        selected && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      {children}
    </button>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

const field = "min-h-11 rounded-xl border bg-card px-3.5 text-sm";

/**
 * After "Not quite": what he should have done. How much on his own, then what, then whether he
 * understood the email. That's the same answer the evals use. It grades him, and it teaches him
 * about the sender. Finishing an old half-answer starts from what was saved.
 */
export function FollowUp({ item, onSaved, onBack }: { item: DecisionWithFeedback; onSaved: () => void; onBack: () => void }) {
  const { decision, review } = item;
  const old = isOldWay(review) ? review : null;
  const [level, setLevel] = useState<Level | null>(old?.should_be_level ?? null);
  const [choice, setChoice] = useState<Choice | null>(old?.should_be_action ?? null);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [why, setWhy] = useState<Why | null>(old?.actual_type ? "misread" : null);
  const [type, setType] = useState(old?.actual_type ?? "");
  const [labelName, setLabelName] = useState("");
  const [note, setNote] = useState(old?.note ?? "");
  const [busy, setBusy] = useState(false);

  // Escape goes back, unless you're typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.key === "Escape" && !target?.closest("input, textarea, select, [contenteditable]")) onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  function pickLevel(next: Level) {
    setLevel(next);
    if (why === "risk" && next !== "ASK_FIRST") setWhy(null);
    // Keep the action if it still fits, so changing only the level is one tap.
    if (choice && !fits(choice, next)) setChoice(null);
    if (next !== "ESCALATE") setReasons([]);
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
    ? "Pick what I should have done."
    : level === "ESCALATE"
      ? reasons.length
        ? null
        : "Say why it should come to you."
      : !choice
        ? "Pick what I should have done with it."
        : choice === "OTHER" && !note.trim()
          ? "Say what I should have done."
          : null;
  const whyMissing = !missing && !finalWhy ? "Say whether I understood the email." : null;
  const typeMissing = finalWhy === "misread" && !type.trim() ? "Say what kind of email it is." : null;
  const sameHint = same && finalWhy !== "misread" && !note.trim() ? "That's what I picked. Change something, or go back and press Right." : null;
  const problem = missing ?? whyMissing ?? typeMissing ?? sameHint;

  async function save() {
    if (busy || problem) return;
    setBusy(true);
    try {
      await sendReview(input());
      notifyChanged();
      onSaved();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[26px]">
      <header className="flex items-center gap-3.5">
        <OscarMood pose="learning" size={80} className="size-16 sm:size-20" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-[-0.01em]">Okay, what should I have done?</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {displayName(decision.sender)} · {decision.subject || "(no subject)"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            I picked: <span className="text-foreground">{whatOscarDid(decision, item.done)}</span>
            {old && <> · You said before: {describeReview(old)}</>}
          </p>
        </div>
      </header>

      <section aria-label="How much I should have done on my own" className="grid grid-cols-2 gap-2.5">
        {LEVELS.map((l) => (
          <button
            key={l.level}
            type="button"
            aria-pressed={level === l.level}
            onClick={() => pickLevel(l.level)}
            className={cn(
              "min-h-14 rounded-2xl border bg-card px-[18px] py-2 text-left text-[15px] font-semibold hover:bg-surface-hover",
              level === l.level && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {l.label}
          </button>
        ))}
      </section>

      {level && (
        <Question title={QUESTION[level]}>
          <div className="flex flex-wrap gap-2">
            {level === "ESCALATE" ? (
              REASONS.map((r) => (
                <Chip
                  key={r.reason}
                  selected={reasons.includes(r.reason)}
                  onClick={() => setReasons((rs) => (rs.includes(r.reason) ? rs.filter((x) => x !== r.reason) : [...rs, r.reason]))}
                >
                  {r.label}
                </Chip>
              ))
            ) : (
              <>
                {ACTIONS_FOR[level].map((a) => (
                  <Chip key={a} selected={choice === a} onClick={() => setChoice(a)}>
                    {chipName(a)}
                  </Chip>
                ))}
                {level === "ASK_FIRST" ? (
                  <Chip selected={choice === "NOTHING"} onClick={() => setChoice("NOTHING")}>
                    Nothing, I&apos;ll handle it
                  </Chip>
                ) : (
                  <Chip selected={choice === "OTHER"} onClick={() => setChoice("OTHER")}>
                    Something else
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
              aria-label="Which label (optional)"
              className={field}
            />
          )}
        </Question>
      )}

      {level && !missing && !autoRisk && (
        <Question title="Did I understand what this email is?">
          <div className="flex flex-wrap gap-2">
            {WHY.filter((w) => w.why !== "risk" || level === "ASK_FIRST").map((w) => (
              <Chip key={w.why} selected={why === w.why} onClick={() => setWhy(w.why)}>
                {w.label}
              </Chip>
            ))}
          </div>
          {why === "misread" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
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
                aria-label="What kind of email it is"
                className={field}
              />
            </div>
          )}
        </Question>
      )}

      {level && (
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={choice === "OTHER" ? "What should I have done? (needed)" : "Anything else? (optional)"}
          aria-label={choice === "OTHER" ? "What should I have done" : "Anything else (optional)"}
          className="min-h-16 rounded-xl bg-card"
        />
      )}

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button className="h-13 px-7 text-base font-bold" disabled={busy || !!problem} onClick={save}>
            Save and next
          </Button>
          <Button variant="ghost" className="h-13 px-5 text-[15px] font-semibold text-muted-foreground" onClick={onBack}>
            Back
          </Button>
        </div>
        {problem && level && (
          <p className="text-sm text-muted-foreground" role="status">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
