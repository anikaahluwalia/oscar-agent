"use client";

import { useEffect, useRef } from "react";
import { Composer } from "@/components/chat/composer";
import { OscarMessage, Typing, YourMessage } from "@/components/chat/messages";
import { moodOf } from "@/components/chat/mood";
import { Page } from "@/components/page";
import { useChat } from "@/lib/chat-store";
import { useOscar } from "@/lib/use-oscar";

export function ChatPage() {
  const { data } = useOscar();
  const { messages, busy } = useChat();
  const items = data?.items ?? [];
  const seen = useRef(false);

  // The page scrolls, not a box inside it: keep the newest message in view.
  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: seen.current ? "smooth" : "instant" });
    seen.current = true;
  }, [messages, busy]);

  return (
    <Page className="max-w-3xl gap-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="border-b pb-3.5">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">Chat</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Ask about your email, or tell me how to handle it. I&apos;ll show you any new rule before I follow it.
        </p>
      </header>

      <div role="log" aria-label="Your chat with Oscar" className="flex flex-1 flex-col gap-5 py-6 sm:gap-[22px]">
        {messages.map((m, i) =>
          m.from === "you" ? (
            <YourMessage key={i} text={m.text} />
          ) : (
            <OscarMessage key={i} message={m} index={i} pose={moodOf(messages, i, items)} items={items} />
          ),
        )}
        {busy && <Typing />}
      </div>

      {/* Stays at the bottom of the screen, above the tab bar on phones. */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-5 bg-background px-5 pt-2 pb-3 sm:-mx-10 sm:px-10 md:bottom-0 md:pb-7">
        <Composer busy={busy} />
      </div>
    </Page>
  );
}
