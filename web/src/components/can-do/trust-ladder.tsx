import Link from "next/link";
import { ArrowRightIcon, LockIcon } from "lucide-react";
import { Panel } from "@/components/kit/panel";
import type { AutonomyRow, Level, PermissionRow } from "@/lib/api";
import { ACTIONS, STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { plural } from "./kinds";

// Top to bottom: the most he does on his own, down to what always comes to you.
const STEPS: { level: Level; note: string; text: string }[] = [
  {
    level: "PROCEED_SILENTLY",
    note: "The most he does on his own",
    text: "Gets on with it without bothering you. Only small things that are easy to undo.",
  },
  {
    level: "PROCEED_AND_NOTIFY",
    note: "Goes ahead, then tells you",
    text: "So you can check it. Anything he changed can be undone.",
  },
  { level: "ASK_FIRST", note: "Waits for your okay", text: "Nothing happens until you say yes." },
];

const DOT: Record<Level, string> = {
  PROCEED_SILENTLY: "bg-level-silent",
  PROCEED_AND_NOTIFY: "bg-level-notify",
  ASK_FIRST: "bg-level-ask",
  ESCALATE: "bg-level-escalate",
};

function Count({ n, phrase }: { n: number | null; phrase: string }) {
  if (n === null) return null;
  return (
    <span className="shrink-0 text-sm font-semibold tabular-nums">
      {n.toLocaleString()}
      <span className="sr-only"> {n === 1 ? "email" : "emails"} {phrase}</span>
    </span>
  );
}

function Step({ level, note, text, n, phrase, last }: { level: Level; note: string; text: string; n: number | null; phrase: string; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className="absolute top-4 bottom-0 left-[5px] w-px bg-border" aria-hidden />}
      <span className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card", DOT[level])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">{STATUS[level].label}</p>
          <Count n={n} phrase={phrase} />
        </div>
        <p className="text-sm">{note}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

function More({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children}
      <ArrowRightIcon className="size-3.5" aria-hidden />
    </Link>
  );
}

type Props = {
  counts: Record<Level, number> | null; // emails at each step in the period, or null with none
  phrase: string; // "in the last 30 days"
  readOnly: boolean;
  rules: PermissionRow[] | null;
  senders: AutonomyRow[];
};

/** The four steps, top to bottom, and the floor learning can never go below. */
export function TrustLadder({ counts, phrase, readOnly, rules, senders }: Props) {
  const askFloor = (rules ?? []).filter((r) => r.floor === "ASK_FIRST").map((r) => ACTIONS[r.action].toLowerCase());
  const now = senders.reduce<Record<Level, number>>(
    (acc, r) => ({ ...acc, [r.level]: acc[r.level] + 1 }),
    { PROCEED_SILENTLY: 0, PROCEED_AND_NOTIFY: 0, ASK_FIRST: 0, ESCALATE: 0 },
  );
  const order: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"];

  return (
    <Panel title="How Oscar earns trust">
      <p className="text-sm text-muted-foreground">
        Each kind of email starts on a set step. Each time you okay what he does with a sender&apos;s email, he gets closer to doing
        it on his own. Say no or undo it, and he steps back down.
      </p>

      {counts && (
        <p className="text-xs text-muted-foreground">
          {readOnly ? `Numbers are where he'd have put your emails ${phrase}. He only reads Gmail for now.` : `Numbers are your emails at each step ${phrase}.`}
        </p>
      )}

      <ol className="flex flex-col">
        {STEPS.map((s) => (
          <Step key={s.level} {...s} n={counts ? counts[s.level] : null} phrase={phrase} />
        ))}
      </ol>

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-status-blocked/40 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-2 font-medium text-status-blocked">
            <LockIcon className="size-4" aria-hidden />
            Safety floor
          </p>
          <p className="text-sm text-status-blocked">Can&apos;t be unlocked by learning.</p>
        </div>
        {askFloor.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Never on his own: {askFloor.join(", ")}. These always wait for you.
          </p>
        )}
        <ol className="flex flex-col">
          <Step
            level="ESCALATE"
            note="Always brings it to you"
            text="Anything about money or passwords, and anything that looks risky, like a scam or instructions aimed at him."
            n={counts ? counts.ESCALATE : null}
            phrase={phrase}
            last
          />
        </ol>
      </div>

      {senders.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm">
            Where he stands today with the {plural(senders.length, "sender and action", "senders and actions")} he&apos;s seen:
          </p>
          <ul className="flex flex-wrap gap-2">
            {order
              .filter((l) => now[l] > 0)
              .map((l) => (
                <li key={l} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", STATUS[l].pill)}>
                  <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  {STATUS[l].label}
                  <span className="tabular-nums">{now[l].toLocaleString()}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="-mb-2 flex flex-col">
        <More href="/knows">See what he&apos;s learned about each sender</More>
        <More href="/promises">See every safety rule</More>
      </div>
    </Panel>
  );
}
