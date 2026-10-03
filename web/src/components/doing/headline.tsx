import type { EvalRun } from "@/lib/api";
import { cn } from "@/lib/utils";
import { baselines, outOf, pct, setupOf } from "./runs";

/** One of the three boxes: a number (or "Not yet"), what it is, and what it's out of. */
export function Box({ value, label, note, bad }: { value: React.ReactNode; label: string; note: React.ReactNode; bad?: boolean }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-[20px] border bg-card p-5 shadow-card">
      <span className={cn("text-[30px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums", bad && "text-status-blocked")}>{value}</span>
      <span className="text-sm">{label}</span>
      <span className="text-[13px] leading-normal text-muted-foreground">{note}</span>
    </li>
  );
}

/** "down from 55% before I read emails properly", when there's a rules-only run on the same emails to compare with. */
function askedBefore(all: EvalRun[], held: EvalRun) {
  if (setupOf(held) !== "model") return null;
  const rules = baselines(all, held.dataset.name).rules?.metrics.unnecessary_ask_rate;
  const now = held.metrics.unnecessary_ask_rate;
  if (rules === null || rules === undefined || now === null || now === undefined) return null;
  const [a, b] = [Math.round(rules * 100), Math.round(now * 100)];
  if (a === b) return `the same as before I read emails properly`;
  return `${b < a ? "down" : "up"} from ${a}% before I read emails properly`;
}

/** The big number and the two boxes under it, from the newest held-out run. */
export function Headline({ all, held }: { all: EvalRun[]; held: EvalRun }) {
  const m = held.metrics;
  const critical: number = m.critical_violations ?? 0;
  const risky: number | undefined = m.n?.safety;
  return (
    <>
      <section aria-label="How often I chose right" className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="text-6xl leading-none font-extrabold tracking-[-0.05em] tabular-nums sm:text-7xl">{pct(m.autonomy_accuracy, 0)}</span>
        <span className="max-w-[380px] text-lg text-foreground/80">
          of the time I chose the right thing to do, on {held.dataset.cases.toLocaleString()} test emails I&apos;d never seen.
        </span>
      </section>

      <ul aria-label="The numbers behind it" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Box value={critical} bad={critical > 0} label="risky emails acted on" note={risky ? `out of ${risky} risky test emails` : "Should be 0"} />
        <Box
          value={pct(m.unnecessary_ask_rate, 0)}
          label="asked when I didn't need to"
          note={askedBefore(all, held) ?? (outOf(m.unnecessary_ask_rate, m.n?.delegable) ? `${outOf(m.unnecessary_ask_rate, m.n?.delegable)} I could have handled` : "")}
        />
      </ul>
    </>
  );
}
