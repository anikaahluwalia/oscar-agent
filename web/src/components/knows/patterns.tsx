"use client";

import { useEffect, useState } from "react";
import { FileTextIcon, SparklesIcon } from "lucide-react";
import { StatusWords } from "@/components/kit/status";
import { Button } from "@/components/ui/button";
import { getPatterns, type Level, type PatternRow, type PatternStatus } from "@/lib/api";
import { ACTIONS, familyName } from "@/lib/labels";
import { oscarSays, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";
import { forgetKindRule, INVOLVE_WORDS, RuleMenu } from "./rule-menu";

/** Your rules and patterns across senders (GET /patterns), fetched again whenever Oscar's data changes. */
export function usePatterns() {
  const { data } = useOscar();
  const [rows, setRows] = useState<PatternRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getPatterns().then(
      (r) => {
        setRows(r);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [data]);
  return { rows, failed };
}

/** What a pattern is about: a kind of email, or the senders at one domain. */
export const patternName = (p: PatternRow) => (p.scope === "domain" ? `Senders at ${p.name}` : familyName(p.kind));

/** The level a rule or pattern sets, if any. */
const levelOf = (p: PatternRow): Level | null => p.level ?? (p.rule === "ask" ? "ASK_FIRST" : p.rule);

export const matches = (q: string, ...texts: (string | null | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q));

const STATUS_WORDS: Record<Exclude<PatternStatus, "rule">, { label: string; tone: string }> = {
  strong: { label: "Strong evidence", tone: "bg-status-handled/10 text-status-handled" },
  moderate: { label: "Moderate evidence", tone: "bg-status-fyi/10 text-status-fyi" },
  learning: { label: "Still learning", tone: "bg-muted text-muted-foreground" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null);

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-dashed px-5 py-6">
      <p className="font-semibold">{title}</p>
      <p className="text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

function Section({ id, title, text, children }: { id: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} data-tour={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        <p className="text-[13px] text-muted-foreground">{text}</p>
      </div>
      {children}
    </section>
  );
}

/** One fact on a rule card: a small label over its value. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{children}</dd>
    </div>
  );
}

/** "Rules you taught me": what you said about every email of a kind. Change it or forget it. */
export function RulesYouTaught({ rows, failed, query }: { rows: PatternRow[] | null; failed: boolean; query: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const rules = (rows ?? []).filter((p) => p.status === "rule" && matches(query, patternName(p), ACTIONS[p.action]));

  async function forget(id: string) {
    setBusy(id);
    try {
      await forgetKindRule(id);
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <Section
      id="knows-rules"
      title="Rules you taught me"
      text="What you told me to do with every email of a kind. I follow these straight away, for any sender. Anything risky still comes to you."
    >
      {failed ? (
        <Empty title="I can't reach my API" text="So I can't show your rules right now." />
      ) : !rows ? (
        <p className="text-[13px] text-muted-foreground">Getting your rules...</p>
      ) : !rules.length ? (
        <Empty
          title={query ? "No rules match your search" : "No rules yet"}
          text={
            query
              ? "Try another word, or clear the search."
              : "When you tell me how to handle emails like one (in Review, or in chat: “just archive promotions”), the rule shows here."
          }
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rules.map((p) => {
            const id = p.decision_id;
            const level = levelOf(p);
            const name = patternName(p);
            return (
              <li key={`${p.kind}|${p.action}`} data-tour="knows-rule" className="flex flex-col gap-4 rounded-[22px] border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileTextIcon className="size-[18px]" strokeWidth={1.9} />
                  </span>
                  <p className="min-w-0 flex-1 text-[15px] font-bold">{name}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Fact label="Action">{ACTIONS[p.action]}</Fact>
                  <Fact label="Involve you">{level ? <StatusWords level={level}>{INVOLVE_WORDS[level]}</StatusWords> : "Not set"}</Fact>
                  <div className="col-span-2">
                    <Fact label="Evidence">
                      <span className="font-normal text-muted-foreground">
                        You set this{day(p.updated_at) ? ` on ${day(p.updated_at)}` : ""}
                        {p.senders > 0 && `, and answered about ${plural(p.senders, "sender", "senders")} like it`}.
                      </span>
                    </Fact>
                  </div>
                </dl>
                {id ? (
                  confirm === id ? (
                    <div role="group" aria-label={`Forget the rule for ${name}?`} className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <span className="text-[13px]">Forget this rule? I&apos;ll go back to asking.</span>
                      <Button variant="destructive" className="h-9 rounded-full px-3.5 text-[13px]" disabled={busy === id} onClick={() => void forget(id)}>
                        Forget
                      </Button>
                      <Button variant="outline" className="h-9 rounded-full px-3.5 text-[13px]" onClick={() => setConfirm(null)}>
                        Keep it
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <RuleMenu decisionId={id} current={level} label="Change" name={name} />
                      <Button variant="outline" className="h-9 rounded-full px-3.5 text-[13px] font-semibold" onClick={() => setConfirm(id)}>
                        Forget
                      </Button>
                    </div>
                  )
                ) : (
                  <p className="border-t pt-3 text-[13px] text-muted-foreground">I need a recent email like this before you can change it here.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** "Patterns I've learned": what your answers about many senders add up to, and how sure that is. */
export function PatternsLearned({ rows, failed, query }: { rows: PatternRow[] | null; failed: boolean; query: string }) {
  const patterns = (rows ?? []).filter((p) => p.status !== "rule" && matches(query, patternName(p), ACTIONS[p.action]));
  if (failed) return null;

  return (
    <Section
      id="knows-patterns"
      title="Patterns I've learned"
      text="What your answers about different senders add up to. I only act on a pattern once at least 3 senders agree, and a sender you taught me about always comes first."
    >
      {!rows ? (
        <p className="text-[13px] text-muted-foreground">Getting what I&apos;ve learned...</p>
      ) : !patterns.length ? (
        <Empty
          title={query ? "No patterns match your search" : "No patterns yet"}
          text={query ? "Try another word, or clear the search." : "When you answer about a few senders of the same kind, what I pick up shows here."}
        />
      ) : (
        <ul className="flex flex-col divide-y rounded-[22px] border bg-card">
          {patterns.map((p) => {
            const status = STATUS_WORDS[p.status as Exclude<PatternStatus, "rule">];
            const level = levelOf(p);
            const name = patternName(p);
            const reviews = Math.round(p.evidence);
            return (
              <li key={`${p.scope}|${p.name}|${p.action}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <SparklesIcon className="size-[18px] text-muted-foreground" strokeWidth={1.9} />
                </span>
                {/* On a phone the name takes the line, and the rest wraps under it. */}
                <div className="flex min-w-0 flex-1 basis-[calc(100%-3.5rem)] flex-col gap-0.5 sm:basis-auto">
                  <p className="text-[15px] font-semibold">{name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {ACTIONS[p.action]} · {plural(reviews, "review", "reviews")} · {plural(p.senders, "sender", "senders")}
                  </p>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", status.tone)}>{status.label}</span>
                <span className="shrink-0 sm:w-36 sm:text-right">
                  {level ? (
                    <StatusWords level={level}>{INVOLVE_WORDS[level]}</StatusWords>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">Still asking you</span>
                  )}
                </span>
                {p.scope === "kind" && p.example_id && (
                  <RuleMenu decisionId={p.example_id} current={null} label="Make it a rule" name={name} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
