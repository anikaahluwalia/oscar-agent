"use client";

import { LearnedHabits } from "@/components/learned-habits";
import { Page, PageHeader } from "@/components/page";

/** What Oscar has learned from you. (Placeholder until the page is built.) */
export function MemoryPage() {
  return (
    <Page className="max-w-4xl">
      <PageHeader title="Oscar's memory" />
      <LearnedHabits />
    </Page>
  );
}
