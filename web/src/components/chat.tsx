"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OscarAvatar } from "@/components/oscar-avatar";
import type { DecisionWithFeedback } from "@/lib/api";
import { askOscar, onAsked, useChat } from "@/lib/chat-store";
import { showEmail } from "@/lib/show-email";
import { isDone } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["What needs me?", "What did you handle?", "What do you know about me?"];

/** Where an email lives in the app: open ones on Home, finished ones in Activity. */
function hrefFor(item: DecisionWithFeedback) {
  return `${isDone(item) ? "/activity" : "/"}#${item.decision.id}`;
}

export function Chat({ items }: { items: DecisionWithFeedback[] }) {
  const { messages, busy } = useChat();
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Keep the newest message in view, inside the chat only (the page itself shouldn't jump).
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  // "Why?" on a card asks here, so bring the chat into view.
  useEffect(() => onAsked(() => box.current?.scrollIntoView({ behavior: "smooth", block: "center" })), []);

  function send(text: string) {
    if (!text.trim() || busy) return;
    setDraft("");
    void askOscar(text.trim());
  }

  return (
    <section ref={box} id="chat" className="flex scroll-mt-6 flex-col gap-3 rounded-3xl bg-card p-4">
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
        <OscarAvatar size={36} /> Talk to Oscar
      </h2>
      <div ref={list} className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.from === "you" && "justify-end")}>
            <div className="flex max-w-[85%] flex-col gap-1.5">
              <p
                className={cn(
                  "rounded-2xl px-3.5 py-2",
                  m.from === "you" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted",
                )}
              >
                {m.text}
              </p>
              {!!m.decisions?.length && (
                <div className="flex flex-wrap gap-1">
                  {m.decisions.slice(0, 6).map((id) => {
                    const item = items.find((i) => i.decision.id === id);
                    if (!item) return null;
                    return (
                      <Link
                        key={id}
                        href={hrefFor(item)}
                        onClick={() => showEmail(id)}
                        className="max-w-full truncate rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {item.decision.subject}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">Oscar is thinking...</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2 rounded-full bg-muted p-1.5 pl-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Oscar or teach him a rule"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon" className="rounded-full" disabled={busy || !draft.trim()} aria-label="Send">
          <ArrowUpIcon />
        </Button>
      </form>
    </section>
  );
}
