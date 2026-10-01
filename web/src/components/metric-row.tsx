import type { Metric } from "@/lib/evals-data";
import { cn } from "@/lib/utils";

function Bar({ value, label, strong }: { value: number; label: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", strong ? "bg-brand" : "bg-muted-foreground/40")} style={{ width: `${value}%` }} />
      </span>
      <span className="text-right tabular-nums">{value.toFixed(1)}%</span>
    </div>
  );
}

/** One eval metric: baseline against learned, as two thin bars. */
export function MetricRow({ metric }: { metric: Metric }) {
  const zero = metric.baseline === 0 && metric.learned === 0;
  return (
    <li className="flex flex-col gap-3 py-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-medium">{metric.label}</p>
          <p className="text-sm text-muted-foreground">{metric.description}</p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">
          {zero ? "0" : `${metric.baseline.toFixed(0)}% → ${metric.learned.toFixed(0)}%`}
        </p>
      </div>
      {!zero && (
        <div className="flex flex-col gap-1.5">
          <Bar label="Baseline" value={metric.baseline} />
          <Bar label="Learned" value={metric.learned} strong />
        </div>
      )}
    </li>
  );
}
