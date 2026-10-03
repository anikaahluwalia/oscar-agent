import type { OscarData } from "@/lib/use-oscar";
import { isOldWay } from "@/lib/labels";

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

function Stat({ value, label, note, children }: { value: string; label: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4">
      <span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
      <span className="text-sm">{label}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
      {children}
    </div>
  );
}

/** Four numbers about Oscar on your inbox. Every one comes from your reviews; nothing is estimated. */
export function ReviewStats({ data }: { data: OscarData }) {
  const real = data.items.filter((i) => i.decision.source === "gmail");
  const reviewed = real.filter((i) => i.review && !isOldWay(i.review)).length;
  const graded = data.reviews.graded;
  const stopped = "acted_when_you_would_stop" in graded ? String(graded.acted_when_you_would_stop) : "–";
  return (
    <section aria-label="How Oscar is doing on your inbox" className="grid grid-cols-2 divide-border rounded-2xl border bg-card shadow-card lg:grid-cols-4 lg:divide-x">
      <Stat value={reviewed.toLocaleString()} label="reviewed" note={`of ${real.length.toLocaleString()}`}>
        <span className="mt-1 h-1.5 rounded-full bg-muted">
          <span className="block h-full rounded-full bg-foreground" style={{ width: `${real.length ? (reviewed / real.length) * 100 : 0}%` }} />
        </span>
      </Stat>
      <Stat value={pct(data.reviews.agreement)} label="you said were right" note={`of ${data.reviews.scored.toLocaleString()} counted`} />
      <Stat value={data.learned.length.toLocaleString()} label={data.learned.length === 1 ? "habit learned" : "habits learned"} note="from your answers" />
      <Stat
        value={stopped}
        label="acted when you'd have stopped it"
        note={stopped === "–" ? "once old reviews are finished" : "safety rules always apply"}
      />
    </section>
  );
}
