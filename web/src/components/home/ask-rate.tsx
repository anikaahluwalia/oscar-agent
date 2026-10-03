"use client";

import { Panel } from "@/components/kit/panel";
import type { DecisionWithFeedback } from "@/lib/api";
import { askRateSeries } from "@/lib/insights";

const W = 240;
const H = 72;
const PAD = 6;
const pct = (r: number) => `${Math.round(r * 100)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * How often Oscar asked you or stopped an email, from his oldest emails to his newest,
 * as a small line. Only drawn when there are enough emails for each point to mean something.
 */
export function AskRate({ items, readOnly, className }: { items: DecisionWithFeedback[]; readOnly: boolean; className?: string }) {
  const series = askRateSeries(items);

  if (!series) {
    return (
      <Panel title="How often Oscar asks" className={className}>
        <p className="text-sm text-muted-foreground">
          Not enough emails yet to show a trend. This fills in once Oscar has read at least 12.
        </p>
      </Panel>
    );
  }

  const first = series[0];
  const last = series[series.length - 1];
  const down = Math.round(last.rate * 100) < Math.round(first.rate * 100);
  const up = Math.round(last.rate * 100) > Math.round(first.rate * 100);
  const title = readOnly
    ? down
      ? "Oscar would ask less now"
      : up
        ? "Oscar would ask more now"
        : "How often Oscar would ask"
    : down
      ? "Oscar is asking less"
      : up
        ? "Oscar is asking more"
        : "How often Oscar asks";
  const asked = readOnly ? "would ask" : "asked";
  // "Decided to": on a real inbox some of these may be from before he acted, when he only said what he'd do.
  const did = readOnly ? "would have asked you about or stopped" : "decided to ask you about or stop";

  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - 2 * PAD);
  const y = (r: number) => PAD + (1 - r) * (H - 2 * PAD);
  const points = series.map((p, i) => `${x(i)},${y(p.rate)}`).join(" ");
  const summary = `${pct(first.rate)} of the first ${first.n} emails, ${pct(last.rate)} of the latest ${last.n}.`;

  return (
    <Panel title={title} className={className}>
      <figure className="flex flex-col gap-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Share of emails Oscar ${did}: ${summary}`}>
          {/* 0% and 100% guides, kept faint */}
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} />
          <line x1={PAD} x2={W - PAD} y1={y(1)} y2={y(1)} className="stroke-border" strokeWidth={1} strokeDasharray="2 3" />
          <polyline points={points} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {series.map((p, i) => (
            <g key={p.from + i}>
              <title>{`${day(p.from)} to ${day(p.to)}: ${pct(p.rate)} of ${p.n} emails`}</title>
              <circle cx={x(i)} cy={y(p.rate)} r={10} fill="transparent" />
              <circle
                cx={x(i)}
                cy={y(p.rate)}
                r={i === 0 || i === series.length - 1 ? 4 : 2.5}
                className="fill-card stroke-primary"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
        <figcaption className="flex items-start justify-between gap-3 text-sm">
          <span className="flex flex-col">
            <span className="font-semibold tabular-nums">
              {pct(first.rate)} {asked}
            </span>
            <span className="text-xs text-muted-foreground">first {first.n} emails</span>
          </span>
          <span className="flex flex-col text-right">
            <span className="font-semibold tabular-nums">
              {pct(last.rate)} {asked}
            </span>
            <span className="text-xs text-muted-foreground">latest {last.n} emails</span>
          </span>
        </figcaption>
        <p className="text-xs text-muted-foreground">
          Share of emails he {did}, oldest to newest.
        </p>
      </figure>
    </Panel>
  );
}
