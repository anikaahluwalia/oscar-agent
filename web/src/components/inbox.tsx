"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DecisionCard } from "@/components/decision-card";
import { LearnedList } from "@/components/learned-list";
import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import {
  getDecisions,
  getLearned,
  loadDemoInbox,
  resetDemo,
  sendFeedback,
  type DecisionWithFeedback,
  type FeedbackKind,
  type LearnedRow,
  type Level,
} from "@/lib/api";

const SECTIONS: { id: string; label: string; levels: Level[]; empty: string }[] = [
  { id: "needs-you", label: "Needs you", levels: ["ESCALATE", "ASK_FIRST"], empty: "Nothing needs you right now." },
  { id: "told-you", label: "Told you", levels: ["PROCEED_AND_NOTIFY"], empty: "Nothing to report." },
  { id: "handled", label: "Handled", levels: ["PROCEED_SILENTLY"], empty: "I haven't handled anything on my own yet." },
];

const API_DOWN = "I can't reach my API. Start it from the repo root with: .venv/bin/uvicorn oscar.api:app --reload";

const ANSWERS = new Set<FeedbackKind>(["APPROVE", "REJECT", "UNDO", "EDIT_THEN_SEND"]);

// The demo sends the same emails again, so only keep Oscar's latest decision on each one.
// The API returns newest first.
function latestPerEmail(items: DecisionWithFeedback[]): DecisionWithFeedback[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.decision.email_id) && seen.add(i.decision.email_id));
}

const fetchAll = () => Promise.all([getDecisions(), getLearned()]);

const isAnswered = (i: DecisionWithFeedback) => i.feedback.some((f) => ANSWERS.has(f.kind));

// How Oscar looks at the top of the page, from what's still waiting on you.
function inboxMood(items: DecisionWithFeedback[]): Mood {
  const waiting = items.filter((i) => !isAnswered(i));
  if (waiting.some((i) => i.decision.autonomy_level === "ESCALATE")) return "alert";
  if (waiting.some((i) => i.decision.autonomy_level === "ASK_FIRST")) return "curious";
  return items.length ? "happy" : "calm";
}

function greeting(items: DecisionWithFeedback[]): string {
  if (items.length === 0) return "Your inbox is empty. Bring in the demo emails and I'll get to work.";
  const count = (levels: Level[]) => items.filter((i) => levels.includes(i.decision.autonomy_level)).length;
  const handled = count(["PROCEED_SILENTLY"]);
  const told = count(["PROCEED_AND_NOTIFY"]);
  const needs = count(["ASK_FIRST", "ESCALATE"]);
  return `I looked at ${items.length} emails. I handled ${handled} quietly, told you about ${told}, and ${needs} need you.`;
}

export function Inbox() {
  const [items, setItems] = useState<DecisionWithFeedback[]>([]);
  const [learned, setLearned] = useState<LearnedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const show = useCallback((result: [DecisionWithFeedback[], LearnedRow[]] | null) => {
    if (result) {
      setItems(latestPerEmail(result[0]));
      setLearned(result[1]);
      setError(null);
    } else {
      setError(API_DOWN);
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(() => fetchAll().then(show, () => show(null)), [show]);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(
      (result) => !cancelled && show(result),
      () => !cancelled && show(null),
    );
    return () => {
      cancelled = true;
    };
  }, [show]);

  async function feedback(decisionId: string, kind: FeedbackKind, editedText?: string): Promise<boolean> {
    try {
      const { reply } = await sendFeedback(decisionId, kind, editedText);
      toast(reply, { icon: <OscarAvatar size={22} /> });
      await refresh();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", { icon: <OscarAvatar size={22} /> });
      return false;
    }
  }

  async function bringInEmails() {
    await loadDemoInbox();
    await refresh();
  }

  async function startOver() {
    await resetDemo();
    await refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center gap-4">
        <OscarAvatar size={64} mood={error ? "calm" : inboxMood(items)} />
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Oscar</h1>
          <p className="text-sm text-muted-foreground">Your inbox, looked after.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={bringInEmails} disabled={!!error}>
            Bring in the demo emails
          </Button>
          <Button variant="outline" onClick={startOver} disabled={!!error}>
            Start over
          </Button>
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
        <OscarAvatar size={36} />
        <p className="pt-1.5 text-sm">{loading ? "Checking your inbox..." : (error ?? greeting(items))}</p>
      </div>

      {!error && (
        <Tabs defaultValue="needs-you">
          <TabsList>
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.label} ({items.filter((i) => s.levels.includes(i.decision.autonomy_level)).length})
              </TabsTrigger>
            ))}
            <TabsTrigger value="learned">What I&apos;ve learned</TabsTrigger>
          </TabsList>
          <TabsContent value="learned" className="pt-2">
            <LearnedList rows={learned} />
          </TabsContent>
          {SECTIONS.map((s) => {
            const shown = items
              .filter((i) => s.levels.includes(i.decision.autonomy_level))
              .sort(
                (a, b) =>
                  Number(isAnswered(a)) - Number(isAnswered(b)) ||
                  s.levels.indexOf(a.decision.autonomy_level) - s.levels.indexOf(b.decision.autonomy_level),
              );
            return (
              <TabsContent key={s.id} value={s.id} className="flex flex-col gap-3 pt-2">
                {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{s.empty}</p>}
                {shown.map((item, index) => (
                  <DecisionCard
                    key={item.decision.id}
                    index={index}
                    dimmed={isAnswered(item)}
                    item={item}
                    onFeedback={(kind, text) => feedback(item.decision.id, kind, text)}
                  />
                ))}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </main>
  );
}
