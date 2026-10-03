import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import { plural } from "@/lib/counts";
import type { DecisionWithFeedback } from "@/lib/api";

type Props = {
  greeting: string; // "Good morning"
  name: string; // empty if you haven't said
  handled: number; // handled on his own since `away` (or would have, while read-only)
  away: boolean; // true: since your last visit. false: first visit here, so the last day
  needs: DecisionWithFeedback[]; // what's waiting on you
  readOnly: boolean;
};

/** What Oscar says under the greeting: what he handled while you were away, and what needs you. */
export function statusCopy({ handled, away, needs, readOnly }: Omit<Props, "greeting" | "name">): { lines: string[]; mood: Mood } {
  const when = away ? "while you were away" : "in the last day";

  if (readOnly) {
    const first = handled
      ? `I would have handled ${plural(handled, "email", "emails")} on my own ${when}.`
      : `Nothing I'd handle on my own came in ${when}.`;
    const second = needs.length ? `${plural(needs.length, "call", "calls")} for you to check.` : "You've checked all my calls!";
    return {
      lines: [first, `I'm only reading Gmail for now, so I don't change anything in it. ${second}`],
      mood: needs.length ? "curious" : "sleepy",
    };
  }

  const stopped = needs.filter((i) => i.decision.autonomy_level === "ESCALATE");
  const first = handled ? `I took care of ${plural(handled, "email", "emails")} ${when}!` : null;
  let second: string;
  if (!needs.length) second = "Nothing needs you right now!";
  else if (!stopped.length) second = `${plural(needs.length, "email needs", "emails need")} your okay.`;
  else {
    const them = stopped.length === 1 ? "it" : "them";
    const which = stopped.length === needs.length ? (needs.length === 1 ? "it" : "all of them") : `${stopped.length.toLocaleString()} of them`;
    second = `${plural(needs.length, "email needs", "emails need")} you. I stopped ${which} and didn't do anything with ${them}.`;
  }
  // "Suspicious" only when a safety check fired; money and password requests are stopped by rule.
  const suspicious = stopped.some((i) => i.decision.safety_flags.length);
  return {
    lines: first ? [first, second] : [second],
    mood: suspicious ? "alert" : needs.length ? "curious" : handled ? "happy" : "sleepy",
  };
}

/** The top of Home: Oscar says hello, then what he did and what's waiting on you. */
export function OscarStatusHeader({ greeting, name, ...rest }: Props) {
  const { lines, mood } = statusCopy(rest);
  return (
    <section className="flex min-w-0 items-center gap-4 sm:gap-5">
      <OscarAvatar size={64} mood={mood} />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          {greeting}
          {name.trim() ? `, ${name.trim()}` : ""}!
        </h1>
        <p className="text-muted-foreground">{lines.join(" ")}</p>
      </div>
    </section>
  );
}
