import { Panel } from "@/components/kit/panel";
import type { EvalRun } from "@/lib/api";
import { interruptions } from "./runs";

/** Where a value sits along the 0 to 10 scale, as a percentage of the track. */
const at = (v: number) => `${Math.min(Math.max(v, 0), 10) * 10}%`;

/**
 * Out of every 10 held-out emails, how many Oscar brought to you (Ask me or Stopped), before and after
 * learning, with a dashed line for how many really needed you. Only two real points, so bars, not a trend line.
 * Labels are HTML so they stay readable at phone width; each bar is a small inline SVG.
 */
export function InterruptionsChart({ before, after }: { before?: EvalRun; after?: EvalRun }) {
  const rows = [
    { key: "before", label: "Before learning", run: before },
    { key: "after", label: "After learning", run: after },
  ]
    .map((r) => ({ ...r, value: r.run ? interruptions(r.run) : null }))
    .filter((r): r is typeof r & { value: NonNullable<typeof r.value> } => r.value !== null);

  if (!rows.length) {
    return (
      <Panel title="Interruptions per 10 emails">
        <p className="text-sm text-muted-foreground">No held-out run saved yet, so there&apos;s nothing to show.</p>
      </Panel>
    );
  }

  const latest = rows.at(-1)!.value;
  const first = rows[0].value.per10;

  return (
    <Panel title="Interruptions per 10 emails">
      <p className="-mt-2 text-sm text-muted-foreground">How many he brought to you (Ask me or Stopped), out of every 10 held-out emails.</p>

      <figure className="flex flex-col gap-2">
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
          {rows.map((r) => (
            <div key={r.key} className="contents">
              <span>{r.label}</span>
              <div className="relative flex h-7 items-center pr-10">
                <div className="relative h-5 w-full" title={`${r.label}: ${r.value.per10.toFixed(1)} in 10 (${r.value.asked} of ${r.value.total} emails)`}>
                  <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 20" aria-hidden>
                    <rect x={0} y={0} width={Math.max(r.value.per10 * 10, 0.5)} height={20} rx={2} className={r.key === "after" ? "fill-primary" : "fill-primary/35"} />
                  </svg>
                  <span className="absolute top-1/2 ml-1.5 -translate-y-1/2 font-semibold tabular-nums" style={{ left: at(r.value.per10) }}>
                    {r.value.per10.toFixed(1)}
                  </span>
                  <span className="absolute -inset-y-1 border-l-2 border-dashed border-foreground/70" style={{ left: at(latest.needed) }} aria-hidden />
                </div>
              </div>
            </div>
          ))}
          <span aria-hidden />
          <div className="relative mr-10 h-4 text-xs text-muted-foreground" aria-hidden>
            {[0, 5, 10].map((t) => (
              <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: at(t) }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0 border-l-2 border-dashed border-foreground/70" aria-hidden />
            Really needed you: {latest.needed.toFixed(1)} in 10 ({latest.neededCount} of {latest.total})
          </span>
        </figcaption>
      </figure>

      <p className="text-sm text-muted-foreground">
        {rows.length < 2
          ? "Only one run saved, so there's no before and after yet."
          : first.toFixed(1) === latest.per10.toFixed(1)
            ? `Learning didn't change how often he asked: ${latest.per10.toFixed(1)} in 10 both times.`
            : `Learning took him from ${first.toFixed(1)} to ${latest.per10.toFixed(1)} in 10.`}
      </p>
    </Panel>
  );
}
