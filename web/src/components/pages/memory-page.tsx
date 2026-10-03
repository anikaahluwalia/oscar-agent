"use client";

import { LearnedHabits } from "@/components/learned-habits";
import { Loading, Page, PageHeader } from "@/components/page";
import { isReadOnly, useOscar } from "@/lib/use-oscar";

/** Oscar's memory: what he has learned about you from your answers, and ways to change or forget it. */
export function MemoryPage() {
  const { data, error } = useOscar();
  const note = !data
    ? null
    : data.gmail.connected
      ? isReadOnly(data)
        ? "On your real inbox I learn from your reviews too. Each answer teaches me about that sender. I'm only reading your email for now, so this is what I would do."
        : "On your real inbox I learn from your reviews too. Each answer teaches me about that sender."
      : "This is the example inbox. What I learn here stays here, apart from your real inbox.";
  return (
    <Page>
      <PageHeader
        title="Oscar's memory"
        text={
          <>
            What Oscar has learned about you from your feedback.
            {note && <span className="mt-1 block text-sm">{note}</span>}
          </>
        }
      />
      {!data ? <Loading error={error} /> : <LearnedHabits data={data} />}
    </Page>
  );
}
