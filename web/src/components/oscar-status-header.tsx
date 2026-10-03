import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import type { Brief, DecisionWithFeedback } from "@/lib/api";
import { needsReview } from "@/lib/labels";
import { isOpen, isUnchecked } from "@/lib/use-oscar";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** A headline in three parts, so one phrase can carry Oscar's gradient. */
type Headline = { lead: string; accent: string; rest?: string; sentence: string; mood: Mood };

/**
 * What Oscar says at the top of Home. It answers one question, "do I need to do anything?",
 * so it reads the same with ten emails or ten thousand: a count of what's waiting on you,
 * never a total of everything he read.
 */
export function statusCopy(items: DecisionWithFeedback[], realInbox = false): Headline {
  if (!items.length) {
    return { lead: "Ready when ", accent: "you are!", sentence: "When emails come in, I'll sort them for you.", mood: "calm" };
  }
  if (realInbox) {
    // Read-only: Oscar didn't do anything, so what waits on you is checking his calls.
    const waiting = items.filter(needsReview).length;
    if (waiting) {
      return {
        lead: "",
        accent: plural(waiting, "call", "calls"),
        rest: " for you to check.",
        sentence: "Read-only for now. Nothing in Gmail changed.",
        mood: "curious",
      };
    }
    return { lead: "Nothing needs you ", accent: "right now!", sentence: "You've checked all my calls. I'll keep an eye out for new email.", mood: "sleepy" };
  }

  const open = items.filter(isOpen);
  const stopped = open.filter((i) => i.decision.autonomy_level === "ESCALATE");
  // "Suspicious" only when a safety check fired; money and password requests are stopped by rule.
  const suspicious = stopped.some((i) => i.decision.safety_flags.length);
  const unchecked = items.filter(isUnchecked).length;
  if (suspicious) {
    const more = open.length - 1;
    return {
      lead: "I held something ",
      accent: "suspicious",
      rest: " for you.",
      sentence: more ? `I didn't do anything with it. ${plural(more, "other email needs", "other emails need")} you too.` : "I didn't do anything with it. Take a look when you can.",
      mood: "alert",
    };
  }
  if (open.length) {
    return {
      lead: "",
      accent: plural(open.length, "email", "emails"),
      rest: open.length === 1 ? " needs you." : " need you.",
      sentence: stopped.length
        ? `I stopped ${stopped.length.toLocaleString()} of them and didn't do anything with ${stopped.length === 1 ? "it" : "them"}.`
        : "They're waiting for your okay.",
      mood: "curious",
    };
  }
  return {
    lead: "Nothing needs you ",
    accent: "right now!",
    sentence: unchecked
      ? `Have a look at ${unchecked === 1 ? "the one" : `the ${unchecked}`} I gave you a heads up about when you can.`
      : "All quiet! I'll come get you if anything shows up.",
    mood: "sleepy",
  };
}

export function OscarStatusHeader({ items, brief, realInbox }: { items: DecisionWithFeedback[]; brief: Brief; realInbox: boolean }) {
  const { lead, accent, rest, sentence, mood } = statusCopy(items, realInbox);
  return (
    <section className="flex items-center gap-5">
      <OscarAvatar size={80} mood={mood} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          {lead}
          {accent}
          {rest}
        </h1>
        <p className="text-muted-foreground">{sentence}</p>
        {/* Learning shows up here once Oscar has picked up a habit. */}
        {(brief.trend || brief.learned) && (
          <p className="text-sm text-muted-foreground">{[brief.trend, brief.learned].filter(Boolean).join(" ")}</p>
        )}
      </div>
    </section>
  );
}
