import Link from "next/link";
import { CheckIcon, FileTextIcon, ShieldIcon, TagIcon, type LucideIcon } from "lucide-react";
import { displayName } from "@/components/kit/sender";
import type { Decision, Level } from "@/lib/api";
import { ACTIONS, typeName } from "@/lib/labels";
import { cn } from "@/lib/utils";

const HOW: Record<Level, string> = {
  PROCEED_SILENTLY: "without asking",
  PROCEED_AND_NOTIFY: "and tell you",
  ASK_FIRST: "after asking you",
  ESCALATE: "never on my own",
};

const domainOf = (sender: string) => sender.split("<").at(-1)!.replace(">", "").split("@")[1] ?? sender;

/**
 * The rule or pattern behind a learned decision, in one line: "Archive emails like this (job alert)
 * without asking". Null when nothing he learned set the level.
 */
export function ruleLine(d: Decision): string | null {
  if (!d.preference || d.level_source !== "learned") return null;
  const what =
    d.preference.scope === "kind"
      ? `emails like this (${typeName(d.email_type).toLowerCase()})`
      : d.preference.scope === "domain"
        ? `emails from senders at ${domainOf(d.sender)}`
        : `emails from ${displayName(d.sender)}`;
  return `${ACTIONS[d.action]} ${what} ${HOW[d.autonomy_level]}`;
}

/** A rule you set gives him full confidence; a pattern is only as sure as your answers. */
export const isRule = (d: Decision) => d.preference?.confidence === 1;

export type Fact = { key: string; icon: LucideIcon; tone: "neutral" | "good" | "safety"; title: string; text: string; link?: { href: string; label: string } };

/**
 * What stood behind Oscar's call, as facts: the rule or pattern he used and what it rests on, what you
 * said the email is, and the safety rule if one decided it. Only what the decision itself records.
 */
export function factsOf(d: Decision): Fact[] {
  const out: Fact[] = [];
  const rule = ruleLine(d);
  if (rule && d.preference) {
    const n = Math.round(d.preference.evidence);
    out.push({ key: "rule", icon: FileTextIcon, tone: "neutral", title: isRule(d) ? "Rule used" : "Pattern I learned", text: rule, link: { href: "/knows", label: "View rule" } });
    out.push({
      key: "evidence",
      icon: CheckIcon,
      tone: "good",
      title: isRule(d) ? "You taught me this" : "You approved this type",
      text: isRule(d)
        ? "You set this yourself, so I follow it straight away."
        : `Based on ${n === 1 ? "1 of your answers" : `${n} of your answers`}${d.preference.scope === "sender" ? ` about ${displayName(d.sender)}` : " about emails like it"}.`,
    });
  }
  if (d.type_from_you) {
    out.push({ key: "type", icon: TagIcon, tone: "neutral", title: "You told me what this is", text: `You said emails from ${displayName(d.sender)} are ${typeName(d.email_type).toLowerCase()}.` });
  }
  if (d.safety_rule) {
    out.push({
      key: "safety",
      icon: ShieldIcon,
      tone: "safety",
      title: d.autonomy_level === "ESCALATE" ? "Safety rule" : "Protected rule",
      text: `${d.safety_rule.charAt(0).toUpperCase()}${d.safety_rule.slice(1)}. Nothing you teach me changes this.`,
      link: { href: "/promises", label: "See promises" },
    });
  }
  return out;
}

const TILE = {
  neutral: "bg-muted text-foreground",
  good: "bg-status-handled/10 text-status-handled",
  safety: "bg-status-blocked/10 text-status-blocked",
};

/** The facts as rows: an icon tile, a bold title, one line under it, and a link where there's more. */
export function DecisionFacts({ decision, className }: { decision: Decision; className?: string }) {
  const facts = factsOf(decision);
  if (!facts.length) return null;
  return (
    <ul className={cn("flex flex-col divide-y", className)}>
      {facts.map((f) => (
        <li key={f.key} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
          <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TILE[f.tone])}>
            <f.icon className="size-[18px]" strokeWidth={1.9} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-semibold">{f.title}</span>
            <span className="text-sm text-muted-foreground">{f.text}</span>
          </div>
          {f.link && (
            <Link href={f.link.href} className="inline-flex min-h-9 shrink-0 items-center rounded-full border bg-card px-3.5 text-[13px] font-semibold hover:bg-surface-hover">
              {f.link.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
