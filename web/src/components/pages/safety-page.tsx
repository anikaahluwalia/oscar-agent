"use client";

import { AlwaysComesToYou } from "@/components/kinds-of-email";
import { Page, PageHeader } from "@/components/page";

/** The protections learning can't change. (Placeholder until the page is built.) */
export function SafetyPage() {
  return (
    <Page className="max-w-4xl">
      <PageHeader title="Safety" />
      <AlwaysComesToYou />
    </Page>
  );
}
