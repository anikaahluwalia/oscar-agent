"use client";

import { ChatPanel } from "@/components/chat-panel";
import { Page, PageHeader } from "@/components/page";

export function ChatPage() {
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Chat" text="Ask about your email, or tell me how to handle it." />
      <ChatPanel variant="drawer" />
    </Page>
  );
}
