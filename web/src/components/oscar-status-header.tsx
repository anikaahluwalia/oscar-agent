import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import type { Brief } from "@/lib/api";
import type { DecisionWithFeedback } from "@/lib/api";
import { countsOf, isOpen, isUnchecked } from "@/lib/use-oscar";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What Oscar says at the top of Home, from what's going on in the inbox. */
export function statusCopy(items: DecisionWithFeedback[]): { headline: string; sentence: string; mood: Mood } {
  const counts = countsOf(items);
  const total = items.length;
  // "Suspicious" only when a safety check fired; money and password requests are stopped by rule.
  const suspicious = items.some((i) => isOpen(i) && i.decision.autonomy_level === "ESCALATE" && i.decision.safety_flags.length);
  const unchecked = items.filter(isUnchecked).length;
  const handled = counts.PROCEED_SILENTLY;
  const fyi = counts.PROCEED_AND_NOTIFY;
  const needs = counts.ASK_FIRST;
  const blocked = counts.ESCALATE;
  const did = [handled && `handled ${plural(handled, "email", "emails")} quietly`, fyi && `told you about ${fyi}`]
    .filter(Boolean)
    .join(" and ");

  if (!total) return { headline: "Nothing new yet.", sentence: "When emails come in, I'll sort them for you.", mood: "calm" };
  if (needs) {
    const also = blocked ? `I also stopped ${plural(blocked, "email", "emails")} for you to look at.` : did ? `I ${did}.` : "";
    return { headline: `I need you for ${plural(needs, "thing", "things")}.`, sentence: also, mood: "curious" };
  }
  if (blocked) {
    return {
      headline: suspicious ? "I stopped something suspicious." : "I stopped something for you.",
      sentence: "No action was taken. Take a look when you can.",
      mood: "alert",
    };
  }
  return {
    headline: "All done.",
    sentence: unchecked
      ? `I ${did}. Take a look at ${unchecked === 1 ? "the one" : `the ${unchecked}`} I told you about when you can.`
      : did
        ? `I ${did}. Nothing needs you.`
        : "Nothing needs you right now.",
    mood: "sleepy",
  };
}

export function OscarStatusHeader({ items, brief }: { items: DecisionWithFeedback[]; brief: Brief }) {
  const { headline, sentence, mood } = statusCopy(items);
  return (
    <section className="flex items-center gap-5">
      <OscarAvatar size={72} mood={mood} />
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{headline}</h1>
        {sentence && <p className="text-muted-foreground">{sentence}</p>}
        {/* Learning shows up here once Oscar has picked up a habit. */}
        {(brief.trend || brief.learned) && (
          <p className="text-sm text-muted-foreground">{[brief.trend, brief.learned].filter(Boolean).join(" ")}</p>
        )}
      </div>
    </section>
  );
}
