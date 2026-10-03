"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, MessageCircleQuestionIcon, ShieldCheckIcon, ShieldAlertIcon, TrendingDownIcon, TrendingUpIcon, type LucideIcon } from "lucide-react";
import { StatusWords } from "@/components/kit/status";
import { getProgress, type Progress, type ProgressWindow } from "@/lib/api";
import { ACTIONS, STATUS, familyName } from "@/lib/labels";
import { useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

/** GET /progress, fetched again whenever Oscar's data changes. */
export function useProgress() {
  const { data } = useOscar();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getProgress().then(
      (p) => {
        setProgress(p);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [data]);
  return { progress, failed };
}

const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const MIN = 5; // oscar/progress.py MIN_GRADED

const CARD = "flex flex-col gap-3 rounded-[22px] border bg-card p-5";

/** "72% of my recent decisions matched your preference", and the earlier figure when there is one. */
export function MatchHeadline({ progress }: { progress: Progress }) {
  const { recent, earlier, graded } = progress;
  if (!progress.enough || !recent) {
    return (
      <section className={CARD}>
        <p className="text-[22px] leading-snug font-bold tracking-[-0.01em]">Not enough answers yet</p>
        <p className="text-sm text-muted-foreground">
          You&apos;ve told me what you wanted on {graded === 1 ? "1 email" : `${graded} emails`}. Once it&apos;s {MIN}, I&apos;ll show how often my calls
          match what you want. Every Review answer, undo and &ldquo;just handle it&rdquo; counts.
        </p>
      </section>
    );
  }
  const change = earlier?.match_rate != null && recent.match_rate != null ? Math.round((recent.match_rate - earlier.match_rate) * 100) : null;
  return (
    <section className={cn(CARD, "gap-2 p-6")} aria-label="How often I match what you want">
      <p className="text-[30px] leading-tight font-extrabold tracking-[-0.03em]">
        <span className="text-status-handled">{pct(recent.match_rate)}</span> of my recent decisions matched your preference
      </p>
      <p className="text-[15px] text-muted-foreground">
        {earlier && change !== null
          ? change > 0
            ? `Up from ${pct(earlier.match_rate)} on the first ${earlier.n} you answered.`
            : change < 0
              ? `Down from ${pct(earlier.match_rate)} on the first ${earlier.n} you answered.`
              : `The same as on the first ${earlier.n} you answered.`
          : `From the ${recent.n} decisions you've told me about. Once there are more, I'll compare them with the first ones.`}
        {` The latest ${recent.n} you answered, ${day(recent.from!)} to ${day(recent.to!)}.`}
      </p>
    </section>
  );
}

function Problem({
  icon: Icon,
  title,
  count,
  outOf,
  earlier,
  zeroGood,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  outOf: string;
  earlier: number | null;
  zeroGood: string;
}) {
  const good = count === 0;
  return (
    <li className={CARD}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            good ? "bg-status-handled/10 text-status-handled" : "bg-status-needs/10 text-status-needs",
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.9} />
        </span>
        <h3 className="text-[15px] font-bold">{title}</h3>
      </div>
      <p className="text-[34px] leading-none font-extrabold tabular-nums">{count}</p>
      <p className="text-[13px] text-muted-foreground">
        {good ? zeroGood : outOf}
        {earlier !== null && ` Earlier: ${earlier}.`}
      </p>
    </li>
  );
}

/** The three ways a call can go wrong, recent against earlier: never padded with emails you didn't answer. */
export function ProblemCards({ progress }: { progress: Progress }) {
  const r: ProgressWindow | null = progress.recent;
  const e = progress.earlier;
  if (!r) return null;
  return (
    <ul className="grid gap-3 lg:grid-cols-3" aria-label="Where my calls went wrong">
      <Problem
        icon={r.unsafe ? ShieldAlertIcon : ShieldCheckIcon}
        title="Unsafe actions taken"
        count={r.unsafe}
        outOf={`Things I did that you'd have wanted stopped, out of ${r.n} you answered.`}
        earlier={e ? e.unsafe : null}
        zeroGood={`Nothing I did was something you'd have wanted stopped, out of ${r.n} you answered.`}
      />
      <Problem
        icon={MessageCircleQuestionIcon}
        title="Unnecessary asks"
        count={r.unnecessary_asks}
        outOf={`Of ${r.asked} times I asked, you'd have had me just do it.`}
        earlier={e ? e.unnecessary_asks : null}
        zeroGood={r.asked ? `Every one of the ${r.asked} times I asked, you wanted to be asked.` : "I didn't ask about any of these."}
      />
      <Problem
        icon={TrendingUpIcon}
        title="Too-permissive decisions"
        count={r.too_permissive}
        outOf={`Of ${r.acted} things I did, you'd have wanted me to ask first.`}
        earlier={e ? e.too_permissive : null}
        zeroGood={r.acted ? `None of the ${r.acted} things I did needed asking first.` : "I didn't do any of these on my own."}
      />
    </ul>
  );
}

/** The ask rate and the handled rate over time, as two lines. */
function Chart({ points }: { points: Progress["trend"]["points"] }) {
  const W = 640;
  const H = 180;
  const pad = { l: 64, r: 14, t: 16, b: 34 };
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const line = (key: "ask_rate" | "handled_rate") => points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const every = Math.ceil(points.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="How often I asked you, and how often I handled it, over time">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "3 4" : undefined} />
          <text x={0} y={y(v) + 5} textAnchor="start" className="fill-muted-foreground text-[13px] max-sm:text-[22px]">
            {v * 100}%
          </text>
        </g>
      ))}
      <polyline points={line("handled_rate")} fill="none" className="stroke-status-handled" strokeWidth={2.5} strokeLinejoin="round" />
      <polyline points={line("ask_rate")} fill="none" className="stroke-status-needs" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.start}>
          <circle cx={x(i)} cy={y(p.handled_rate)} r={3.5} className="fill-status-handled" />
          <circle cx={x(i)} cy={y(p.ask_rate)} r={3.5} className="fill-status-needs" />
          {i % every === 0 && (
            <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[13px] max-sm:text-[22px]">
              {day(p.start)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** What the line says, in words. Only what the numbers show, and the rules you set along the way. */
function trendWords(progress: Progress) {
  const { points, unit, rules = [] } = progress.trend;
  const first = points[0];
  const last = points.at(-1)!;
  const per = unit === "week" ? "week" : "day";
  const moved =
    last.ask_rate < first.ask_rate
      ? `I asked about ${pct(last.ask_rate)} of emails in the latest ${per}, down from ${pct(first.ask_rate)} in the first.`
      : last.ask_rate > first.ask_rate
        ? `I asked about ${pct(last.ask_rate)} of emails in the latest ${per}, up from ${pct(first.ask_rate)} in the first. That can happen when new kinds of email come in.`
        : `I asked about ${pct(last.ask_rate)} of emails in the latest ${per}, the same as in the first.`;
  const set = rules.filter((r) => r.kind !== "FORGET" && r.family && r.at >= first.start);
  const taught = set.length
    ? ` You set ${set.length === 1 ? "a rule" : `${set.length} rules`} along the way: ${set
        .slice(-3)
        .map((r) => `${familyName(r.family!).toLowerCase()} on ${day(r.at)}`)
        .join(", ")}.`
    : "";
  return moved + taught;
}

/** "How often I need you": asks going down and handled going up is the hope, but the line shows what happened. */
export function NeedYouTrend({ progress }: { progress: Progress }) {
  const { points, unit } = progress.trend;
  return (
    <section aria-labelledby="need-you" className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="need-you" className="text-lg font-bold">
            How often I need you
          </h2>
          <p className="text-[13px] text-muted-foreground">Share of each {unit === "week" ? "week's" : "day's"} emails I asked you about, and handled on my own.</p>
        </div>
        <div className="flex gap-4 text-[13px] font-semibold">
          <span className="flex items-center gap-1.5 text-status-needs">
            <TrendingDownIcon className="size-4" aria-hidden /> Asked you
          </span>
          <span className="flex items-center gap-1.5 text-status-handled">
            <TrendingUpIcon className="size-4" aria-hidden /> Handled
          </span>
        </div>
      </div>
      {points.length < 2 ? (
        <p className="rounded-2xl border border-dashed px-5 py-6 text-[13px] text-muted-foreground">
          {points.length ? `Only one ${unit} of email so far. Come back after another and I'll draw the line.` : "No emails yet."}
        </p>
      ) : (
        <>
          <Chart points={points} />
          <p className="text-sm text-muted-foreground">{trendWords(progress)}</p>
        </>
      )}
    </section>
  );
}

/** "Where I've learned the most": how much he involved you on the first email of a kind, and on the latest. */
export function LearnedMost({ progress }: { progress: Progress }) {
  const rows = progress.learned_most;
  return (
    <section aria-labelledby="learned-most" className={CARD}>
      <div className="flex flex-col gap-0.5">
        <h2 id="learned-most" className="text-lg font-bold">
          Where I&apos;ve learned the most
        </h2>
        <p className="text-[13px] text-muted-foreground">The first email of each kind, against the latest one. Anything a safety rule stopped is left out.</p>
      </div>
      {!rows.length ? (
        <p className="rounded-2xl border border-dashed px-5 py-6 text-[13px] text-muted-foreground">
          Nothing has changed yet. As you answer me, the kinds of email I handle differently show here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((r) => (
            <li key={`${r.kind}|${r.action}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3">
              <div className="flex min-w-0 flex-1 basis-full flex-col sm:basis-auto">
                <span className="text-[15px] font-semibold">{familyName(r.kind)}</span>
                <span className="text-[13px] text-muted-foreground">
                  {ACTIONS[r.action]} · {r.emails} emails since {day(r.since)}
                </span>
              </div>
              <span className="flex items-center gap-2.5 text-[13px]">
                <span className="text-muted-foreground">Earlier</span>
                <StatusWords level={r.earlier}>{STATUS[r.earlier].label}</StatusWords>
                <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Now</span>
                <StatusWords level={r.now}>{STATUS[r.now].label}</StatusWords>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
