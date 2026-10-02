import type { ReviewLabel, ReviewSummary } from "@/lib/api";
import { REVIEW_LABELS } from "@/lib/labels";

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

/** How Oscar did on the real inbox, from your reviews. Skips don't count either way. */
export function RealInboxResults({ summary }: { summary: ReviewSummary }) {
  const versions = Object.entries(summary.by_version);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-2xl border bg-card p-5">
        <p>
          <span className="text-2xl font-semibold tabular-nums">{pct(summary.agreement)}</span>{" "}
          <span className="text-sm text-muted-foreground">agreement</span>
        </p>
        <p className="self-end text-sm text-muted-foreground">
          {summary.reviewed} of {summary.decisions} decisions reviewed · {summary.scored} counted
        </p>
        {summary.rereads && summary.rereads.scored > 0 && (
          <p className="w-full text-sm text-muted-foreground">
            Re-reads: {pct(summary.rereads.agreement)} agreement on {summary.rereads.scored} reviewed, kept out of the
            number above because some of those emails helped fix Oscar.
          </p>
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(REVIEW_LABELS) as ReviewLabel[]).map((label) => (
          <li key={label} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm">
            <span title={REVIEW_LABELS[label].meaning}>{REVIEW_LABELS[label].label}</span>
            <span className="font-medium tabular-nums">{summary.labels[label]}</span>
          </li>
        ))}
      </ul>
      {versions.length > 1 && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Version of Oscar</th>
              <th className="py-1 font-normal">Counted</th>
              <th className="py-1 font-normal">Agreement</th>
            </tr>
          </thead>
          <tbody>
            {versions.map(([version, v]) => (
              <tr key={version} className="border-t">
                <td className="py-1.5 font-mono text-xs">{version}</td>
                <td className="py-1.5 tabular-nums">{v.scored}</td>
                <td className="py-1.5 tabular-nums">{pct(v.agreement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
