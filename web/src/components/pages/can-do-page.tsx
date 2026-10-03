"use client";

import { AlwaysComesToYou, KindsOfEmail } from "@/components/kinds-of-email";
import { Page, PageHeader, Section } from "@/components/page";

/** What Oscar may do on his own, by kind of email. (Placeholder until the page is built.) */
export function CanDoPage() {
  return (
    <Page className="max-w-4xl">
      <PageHeader title="What Oscar can do" />
      <Section title="By kind of email">
        <KindsOfEmail />
      </Section>
      <Section title="Always comes to you">
        <AlwaysComesToYou />
      </Section>
    </Page>
  );
}
