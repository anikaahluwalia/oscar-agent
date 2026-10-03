"use client";

import Link from "next/link";
import { SparklesIcon, XIcon } from "lucide-react";
import { addressOf } from "@/components/kit/sender";
import { OscarMood } from "@/components/oscar-mood";
import { Button } from "@/components/ui/button";
import type { Action, LearnedRow, Level, PermissionRow } from "@/lib/api";
import { useLocalSetting } from "@/lib/local-setting";

const PAST: Partial<Record<Action, string>> = { ARCHIVE: "archived", MARK_READ: "marked as read", APPLY_LABEL: "labelled" };
// What a rule for a kind of email is about, by the kind on that row of the rules.
const KINDS: Record<string, string> = {
  newsletter: "promotional emails and newsletters",
  receipt: "receipts",
  fyi: "notices that need nothing from you",
};
const RECENT = 7 * 86_400_000;

type Fresh = { at: string; text: string; sub: string };

const subFor = (level: Level) =>
  level === "PROCEED_SILENTLY" ? "I'll handle similar ones without asking from now on." : "I'll handle similar ones and let you know.";

/**
 * The newest thing Oscar learned that lets him do more on his own: a rule for a kind of email, or
 * a sender. Only one he learned in the last week and newer than the last one you dismissed.
 */
export function freshLearning(learned: LearnedRow[], rules: PermissionRow[] | null, seen: string, now: number): Fresh | null {
  const acts = (l: Level | null | undefined): l is Level => l === "PROCEED_SILENTLY" || l === "PROCEED_AND_NOTIFY";
  const found: Fresh[] = [];
  for (const r of rules ?? []) {
    const l = r.learned;
    if (!l || !acts(l.level) || !l.updated_at || !PAST[r.action] || !KINDS[r.email_type]) continue;
    found.push({ at: l.updated_at, text: `You ${l.rule ? "want" : "usually want"} ${KINDS[r.email_type]} ${PAST[r.action]}.`, sub: subFor(l.level) });
  }
  for (const r of learned) {
    if (!acts(r.level) || !r.updated_at || !PAST[r.action]) continue;
    const who = addressOf(r.sender) || r.sender;
    found.push({ at: r.updated_at, text: `You ${r.told ? "want" : "usually want"} emails from ${who} ${PAST[r.action]}.`, sub: subFor(r.level) });
  }
  const t = (iso: string) => new Date(iso).getTime();
  const fresh = found.filter((f) => now - t(f.at) <= RECENT && (!seen || t(f.at) > t(seen)));
  return fresh.sort((a, b) => t(b.at) - t(a.at))[0] ?? null;
}

/** Shown once, when Oscar has just learned something. What he learned stays in What Oscar knows. */
export function LearnedCard({ learned, rules, now }: { learned: LearnedRow[]; rules: PermissionRow[] | null; now: number }) {
  const [seen, setSeen] = useLocalSetting<string>("learned-seen", "");
  const fresh = freshLearning(learned, rules, seen, now);
  if (!fresh) return null;
  return (
    <section aria-label="Oscar learned something" className="flex flex-col items-start gap-4 rounded-[24px] border bg-card px-5 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
      <OscarMood pose="learning" size={96} className="size-20 shrink-0 sm:size-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-status-handled/12 px-2.5 py-1 text-xs font-semibold text-status-handled">
          <SparklesIcon className="size-3.5" aria-hidden /> Oscar learned something
        </span>
        <p className="text-lg leading-snug font-bold sm:text-xl">{fresh.text}</p>
        <p className="text-sm text-muted-foreground sm:text-[15px]">{fresh.sub}</p>
      </div>
      <div className="flex items-center gap-1 self-end sm:self-center">
        <Button asChild variant="outline" className="h-10 rounded-full px-4 text-sm font-semibold">
          <Link href="/knows" onClick={() => setSeen(fresh.at)}>
            Change this
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="size-10 text-muted-foreground" aria-label="Dismiss" onClick={() => setSeen(fresh.at)}>
          <XIcon className="size-4" />
        </Button>
      </div>
    </section>
  );
}
