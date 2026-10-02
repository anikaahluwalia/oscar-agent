"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendReview, type Action, type Decision, type DecisionWithFeedback, type Level, type ReviewLabel } from "@/lib/api";
import { ACTIONS, REVIEW_LABELS } from "@/lib/labels";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const ORDER: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"];
const stricter = (a: Level, b: Level) => ORDER.indexOf(a) > ORDER.indexOf(b);

// What each level means, in your words.
const LEVEL_CHOICES: Record<Level, string> = {
  PROCEED_SILENTLY: "Just handle it quietly",
  PROCEED_AND_NOTIFY: "Do it and give me a heads up",
  ASK_FIRST: "Ask me first",
  ESCALATE: "Stop it and bring it to me",
};

// Kinds of email, for "he got what kind of email this is wrong".
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

type Choice = {
  label: ReviewLabel;
  title: string;
  hint: string;
  ask?: "stricter" | "looser" | "action" | "type" | "note"; // the follow-up question, if any
};

/** The ways Oscar could have got this email wrong, only the ones that make sense for what he wanted to do. */
function choicesFor(d: Decision): Choice[] {
  const level = d.autonomy_level;
  const out: Choice[] = [
    {
      label: "INCORRECT_TYPE",
      title: "He got what kind of email this is wrong",
      hint: "Like reading a promo as a message that needs a reply.",
      ask: "type",
    },
    {
      label: "INCORRECT_ACTION",
      title: "Right idea, but I'd do something else with it",
      hint: `He'd ${ACTIONS[d.action].toLowerCase()}. Like marking it as read instead of archiving.`,
      ask: "action",
    },
  ];
  if (level === "ESCALATE") {
    out.push({ label: "UNNECESSARY_FLAGGING", title: "It's harmless, he didn't need to stop it", hint: "Nothing risky in it.", ask: "looser" });
  } else {
    out.push({ label: "MISINTERPRETED_RISK", title: "This is risky and he missed it", hint: "Like a scam or a request for money or passwords.", ask: "stricter" });
  }
  if (level === "ASK_FIRST" || level === "PROCEED_AND_NOTIFY") {
    out.push({ label: "QUESTIONED_TOO_MUCH", title: "He didn't need to check with me", hint: "He could have done more on his own.", ask: "looser" });
  }
  if (level === "PROCEED_SILENTLY" || level === "PROCEED_AND_NOTIFY") {
    out.push({ label: "NEEDED_TO_ASK", title: "He should have asked me first", hint: "Too much on his own for this one.", ask: "stricter" });
  }
  out.push({ label: "OTHER", title: "Something else", hint: "None of these fit. Say what was wrong.", ask: "note" });
  return out;
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

/**
 * Scoring one of Oscar's decisions on the real inbox: first "did he get it right?",
 * then, if not, what was wrong, with only the options that fit this email. It
 * measures him; he doesn't learn from it.
 */
export function ReviewPanel({ item }: { item: DecisionWithFeedback }) {
  const { decision, review } = item;
  const [step, setStep] = useState<"ask" | "wrong">("ask");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!review);

  function start(next: "ask" | "wrong", picked: Choice | null = null) {
    setStep(next);
    setChoice(picked);
    setLevel(null);
    setAction(null);
    setType("");
    setNote("");
  }

  async function save(label: ReviewLabel) {
    setBusy(true);
    try {
      await sendReview({
        decision_id: decision.id,
        label,
        should_be_level: level,
        should_be_action: action,
        actual_type: type.trim() || null,
        note: note.trim() || null,
      });
      start("ask");
      setEditing(false);
      notifyChanged();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Already reviewed: say what you said, with a way to change it.
  if (review && !editing) {
    const extra = [
      review.should_be_level && LEVEL_CHOICES[review.should_be_level],
      review.should_be_action && ACTIONS[review.should_be_action],
      review.actual_type,
    ].filter(Boolean);
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-4 py-3 text-sm">
        <p>
          You said: <span className="font-medium">{REVIEW_LABELS[review.label].label}</span>
          {extra.length > 0 && <span className="text-muted-foreground"> · {extra.join(" · ")}</span>}
        </p>
        <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Change
        </button>
      </div>
    );
  }

  const levels = choice?.ask === "stricter" || choice?.ask === "looser"
    ? ORDER.filter((l) => (choice.ask === "stricter" ? stricter(l, decision.autonomy_level) : stricter(decision.autonomy_level, l)))
    : [];
  const ready =
    !choice?.ask ||
    (choice.ask === "type" ? !!type.trim() : choice.ask === "action" ? !!action : choice.ask === "note" ? !!note.trim() : !!level);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
      {step === "ask" ? (
        <>
          <p className="text-sm font-medium">Did Oscar get this right?</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => save("CORRECT")}>
              Yes, that&apos;s right
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => start("wrong")}>
              No
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save("SKIP")}>
              Not sure
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">What was wrong?</p>
          <ul className="flex flex-col gap-1.5">
            {choicesFor(decision).map((c) => (
              <li key={c.label}>
                <button
                  type="button"
                  aria-pressed={choice?.label === c.label}
                  onClick={() => start("wrong", c)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left hover:bg-surface-hover",
                    choice?.label === c.label && "border-foreground/40 bg-surface-hover",
                  )}
                >
                  <span className="text-sm">{c.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.hint} <span className="opacity-70">· {REVIEW_LABELS[c.label].label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {choice?.ask === "type" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">What kind of email is it really?</p>
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
          {choice?.ask === "action" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">What would you do with it?</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(ACTIONS) as Action[])
                  .filter((a) => a !== decision.action)
                  .map((a) => (
                    <Chip key={a} selected={action === a} onClick={() => setAction(a)}>
                      {ACTIONS[a]}
                    </Chip>
                  ))}
              </div>
            </div>
          )}
          {levels.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">What should he have done?</p>
              <div className="flex flex-wrap gap-1.5">
                {levels.map((l) => (
                  <Chip key={l} selected={level === l} onClick={() => setLevel(l)}>
                    {LEVEL_CHOICES[l]}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {choice && (
            <>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={choice.ask === "note" ? "What was wrong? (needed)" : "Anything else? (optional)"}
                className="min-h-14"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !ready} onClick={() => save(choice.label)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => start("ask")}>
                  Back
                </Button>
              </div>
            </>
          )}
          {!choice && (
            <button type="button" onClick={() => start("ask")} className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Back
            </button>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">This checks Oscar&apos;s work. He doesn&apos;t learn from it.</p>
    </div>
  );
}
