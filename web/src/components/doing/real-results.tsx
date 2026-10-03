import type { Graded, Level, Rate, ReviewLabel, ReviewSummary, ReviewTally } from "@/lib/api";
import { REVIEW_LABELS, STATUS } from "@/lib/labels";

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);
const rate = (r: Rate) => (r.of ? `${pct(r.rate)} of ${r.of}` : "n/a");

const SHORT = (l: Level) => STATUS[l].label;

type Full = Extract<Graded, { passed: number }>;
const isFull = (g: Graded): g is Full => "passed" in g;

/** The eval measures, from reviews with a full answer. Every rate says what it's out of. */
function Measured({ graded }: { graded: Full }) {
  const rows: [string, string][] = [
    ["Right level", rate(graded.level_accuracy)],
    ["Right action", rate(graded.action_accuracy)],
    ["Asked when he didn't need to", rate(graded.unnecessary_ask_rate)],
    ["Acted when he should have waited", rate(graded.too_permissive_rate)],
    ["Acted when you'd have stopped it", String(graded.acted_when_you_would_stop)],
    ["Cost per email (as in the evals)", graded.risk_weighted_error.toFixed(2)],
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 text-sm">
            <dt>{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        When he was wrong: misread the email {graded.why.misread} · read it right, you&apos;d do it differently{" "}
        {graded.why.preference} · missed a risk {graded.why.risk}
      </p>
      <div className="overflow-x-auto rounded-2xl border bg-card px-4 py-2 shadow-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 pr-3 font-normal">Should have ↓ / Oscar →</th>
              {graded.confusion.levels.map((l) => (
                <th key={l} scope="col" className="px-2 py-1 text-right font-normal">
                  {SHORT(l)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {graded.confusion.levels.map((l, i) => (
              <tr key={l} className="border-t">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {SHORT(l)}
                </th>
                {graded.confusion.counts[i].map((n, j) => (
                  <td key={j} className={i === j ? "px-2 py-1.5 text-right font-medium tabular-nums" : "px-2 py-1.5 text-right tabular-nums"}>
                    {n}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GradedPart({ tally }: { tally: ReviewTally }) {
  const g = tally.graded;
  if ("held_back" in g) {
    return (
      <p className="rounded-2xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
        {tally.old_way} {tally.old_way === 1 ? "review is" : "reviews are"} only half an answer, from the old review screen. Finish{" "}
        {tally.old_way === 1 ? "it" : "them"} on the Review page, under Finish these, to see how Oscar does measured the same way as the evals. Until then
        it would mostly count your Yeses, and look much better than he is.
      </p>
    );
  }
  if (!isFull(g)) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-medium">Measured like the evals</span>{" "}
        <span className="text-muted-foreground">
          · {g.passed} of {g.n} right
        </span>
      </p>
      <Measured graded={g} />
    </div>
  );
}

/** How Oscar did on the real inbox, from your reviews. Skips don't count either way. */
export function RealInboxResults({ summary }: { summary: ReviewSummary }) {
  const versions = Object.entries(summary.by_version);
  const rereads = summary.rereads;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-2xl border bg-card p-5 shadow-card">
        {summary.scored ? (
          <p>
            <span className="text-2xl font-semibold tabular-nums">{pct(summary.agreement)}</span>{" "}
            <span className="text-sm text-muted-foreground">you said were right</span>
          </p>
        ) : (
          <p className="text-sm">None of your reviews count yet. Skips don&apos;t count either way.</p>
        )}
        <p className="self-end text-sm text-muted-foreground">
          {summary.reviewed} of {summary.decisions} decisions reviewed · {summary.scored} counted
        </p>
        {rereads && rereads.graded.n > 0 && isFull(rereads.graded) && (
          <p className="w-full text-sm text-muted-foreground">
            Re-read by a newer Oscar: {rereads.graded.passed} of {rereads.graded.n} right against your answers. Kept out of
            the number above because some of those emails helped fix him.
          </p>
        )}
      </div>
      <GradedPart tally={summary} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(REVIEW_LABELS) as ReviewLabel[]).map((label) => (
          <li key={label} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 text-sm">
            <span className="flex min-w-0 flex-col">
              {REVIEW_LABELS[label].label}
              <span className="text-xs text-muted-foreground">{REVIEW_LABELS[label].meaning}</span>
            </span>
            <span className="font-medium tabular-nums">{summary.labels[label]}</span>
          </li>
        ))}
      </ul>
      {versions.length > 1 && (
        <div className="overflow-x-auto rounded-2xl border bg-card px-4 py-2 shadow-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 font-normal">Version of Oscar</th>
                <th scope="col" className="px-2 py-1 text-right font-normal">Counted</th>
                <th scope="col" className="px-2 py-1 text-right font-normal">Right</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(([version, v]) => (
                <tr key={version} className="border-t">
                  <th scope="row" className="py-1.5 pr-3 text-left font-mono text-xs font-normal">
                    {version}
                  </th>
                  <td className="px-2 py-1.5 text-right tabular-nums">{v.scored}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(v.agreement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
