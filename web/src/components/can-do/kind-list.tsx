import { createElement } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { Level, PermissionRow } from "@/lib/api";
import { ACTIONS, STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { iconFor, nameFor, plural, type KindRow } from "./kinds";

// Below this many emails a percentage says more than the data does, so the page shows "2 of 3".
const PERCENT_FROM = 5;

const SEGMENTS: { key: "quiet" | "told" | "asked" | "stopped"; level: Level; bar: string }[] = [
  { key: "quiet", level: "PROCEED_SILENTLY", bar: "bg-level-silent" },
  { key: "told", level: "PROCEED_AND_NOTIFY", bar: "bg-level-notify" },
  { key: "asked", level: "ASK_FIRST", bar: "bg-level-ask" },
  { key: "stopped", level: "ESCALATE", bar: "bg-level-escalate" },
];

/** The tile behind a kind's icon, tinted by where Oscar stands with it. */
function KindIcon({ kind, level }: { kind: string; level: Level | null }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        level ? STATUS[level].pill : "bg-primary/10 text-primary",
      )}
      aria-hidden
    >
      {createElement(iconFor(kind), { className: "size-5" })}
    </span>
  );
}

/** What he may do with a kind: its starting rule, or, for kinds with no rule of their own, what he did most. */
function RuleLine({ rule, usual }: { rule: PermissionRow | null; usual: KindRow["usual"] }) {
  if (rule) {
    if (rule.floor === "ESCALATE" || rule.level === "ESCALATE") {
      return <Line text="Always brings it to you" level="ESCALATE" />;
    }
    const action = rule.instead ?? rule.action;
    return <Line text={`${ACTIONS[action]}${rule.instead ? " (your setting)" : ""}, starts at`} level={rule.level} />;
  }
  if (!usual) return null;
  if (usual.level === "ESCALATE") return <Line text="Usually brings it to you" level="ESCALATE" />;
  return <Line text={`Usual pick: ${ACTIONS[usual.action].toLowerCase()}`} level={usual.level} />;
}

function Line({ text, level }: { text: string; level: Level }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span>{text}</span>
      <StatusPill level={level} />
    </span>
  );
}

/** The stacked bar: Quietly, Tell me, Ask me and Stopped, as shares of this kind's emails. */
function Bar({ row }: { row: KindRow }) {
  const parts = SEGMENTS.filter((s) => row[s.key] > 0);
  const said = parts.map((s) => `${row[s.key]} ${STATUS[s.level].label}`).join(", ");
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={said}>
      {parts.map((s) => (
        <span key={s.key} className={cn("h-full", s.bar)} style={{ width: `${(row[s.key] / row.n) * 100}%` }} />
      ))}
    </div>
  );
}

function share(row: KindRow) {
  if (row.n < PERCENT_FROM) return `${row.onOwn} of ${row.n}`;
  return `${Math.round((row.onOwn / row.n) * 100)}%`;
}

function KindItem({ row, realInbox }: { row: KindRow; realInbox: boolean }) {
  const level = row.rule?.level ?? row.usual?.level ?? null;
  return (
    <li className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      <KindIcon kind={row.kind} level={level} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate font-medium">{row.name}</p>
          <p className="shrink-0 text-sm font-semibold tabular-nums">
            {share(row)}
            <span className="sr-only"> on his own</span>
          </p>
        </div>
        <Bar row={row} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <RuleLine rule={row.rule} usual={row.usual} />
          <span className="tabular-nums">
            {plural(row.n, "email")}
            {realInbox && row.onOwn > 0 && ` · did ${row.did.toLocaleString()} in Gmail`}
          </span>
        </div>
      </div>
    </li>
  );
}

/** A kind with a rule but no emails in the period: just the rule. */
function RuleOnlyItem({ rule }: { rule: PermissionRow }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <KindIcon kind={rule.email_type} level={rule.level} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium">{nameFor(rule.email_type)}</p>
        <div className="text-xs text-muted-foreground">
          <RuleLine rule={rule} usual={null} />
        </div>
      </div>
    </li>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="What the bar colours mean">
      {SEGMENTS.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", s.bar)} aria-hidden />
          {STATUS[s.level].label}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  rows: KindRow[];
  rules: PermissionRow[] | null;
  rulesFailed: boolean;
  caption: string;
  empty: string;
  realInbox: boolean;
};

/** One row per kind of email: how much of it he handled on his own, and what he may do with it. */
export function KindList({ rows, rules, rulesFailed, caption, empty, realInbox }: Props) {
  const seen = new Set(rows.map((r) => r.kind));
  const quiet = (rules ?? []).filter((r) => !seen.has(r.email_type));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{caption}</p>
        {rows.length > 0 && <Legend />}
      </div>

      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {rows.map((r) => (
            <KindItem key={r.kind} row={r} realInbox={realInbox} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      )}

      {rulesFailed && <p className="text-sm text-muted-foreground">I can&apos;t reach my API, so I can&apos;t show my rules.</p>}
      {quiet.length > 0 && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {rows.length > 0 ? "No emails of these kinds yet" : "His rules for each kind"}
          </h3>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {quiet.map((r) => (
              <RuleOnlyItem key={r.action} rule={r} />
            ))}
          </ul>
        </div>
      )}

      <Link
        href="/settings"
        className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-primary hover:underline"
      >
        Choose what he does with promotions and newsletters in Settings
        <ArrowRightIcon className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
