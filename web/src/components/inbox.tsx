"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DecisionCard } from "@/components/decision-card";
import { LearnedList } from "@/components/learned-list";
import { OscarAvatar } from "@/components/oscar-avatar";
import type { Level } from "@/lib/api";
import { API_DOWN, isAnswered, useOscar } from "@/lib/use-oscar";

const SECTIONS: { id: string; label: string; levels: Level[]; empty: string }[] = [
  { id: "needs-you", label: "Needs you", levels: ["ESCALATE", "ASK_FIRST"], empty: "Nothing needs you right now." },
  { id: "told-you", label: "Told you", levels: ["PROCEED_AND_NOTIFY"], empty: "Nothing to report." },
  { id: "handled", label: "Handled", levels: ["PROCEED_SILENTLY"], empty: "I haven't handled anything on my own yet." },
];

export function Inbox() {
  const { data, error, loading, feedback } = useOscar();
  const items = data?.items ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-12">
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
        <OscarAvatar size={36} />
        <p className="pt-1.5 text-sm">{loading ? "Checking your inbox..." : error ? API_DOWN : data?.brief.summary}</p>
      </div>

      {data && (
        <Tabs defaultValue="needs-you">
          <TabsList className="w-full justify-start overflow-x-auto">
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.label} ({items.filter((i) => s.levels.includes(i.decision.autonomy_level)).length})
              </TabsTrigger>
            ))}
            <TabsTrigger value="learned">What I&apos;ve learned</TabsTrigger>
          </TabsList>
          <TabsContent value="learned" className="pt-2">
            <LearnedList rows={data.learned} />
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
