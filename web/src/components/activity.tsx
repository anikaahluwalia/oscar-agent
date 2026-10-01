"use client";

import { EmailRow } from "@/components/email-row";
import { OscarAvatar } from "@/components/oscar-avatar";
import { API_DOWN, isDone, useOscar } from "@/lib/use-oscar";

export function Activity() {
  const { data, error, loading, feedback } = useOscar();
  const done = (data?.items ?? []).filter(isDone);
  const quiet = done.filter((i) => i.decision.autonomy_level === "PROCEED_SILENTLY").length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-16 sm:px-8">
      <section className="flex items-center gap-4">
        <OscarAvatar size={64} mood="happy" />
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Checking your inbox..."
              : error
                ? API_DOWN
                : done.length
                  ? `Everything that's done, newest first. ${quiet ? `I handled ${quiet} without bothering you.` : ""}`
                  : "Nothing's done yet. Emails I handle and ones you answer will show up here."}
          </p>
        </div>
      </section>

      {done.length > 0 && (
        <ul className="flex flex-col gap-2">
          {done.map((item, index) => (
            <EmailRow key={item.decision.id} index={index} item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
          ))}
        </ul>
      )}
    </main>
  );
}
