"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import { EmailLink } from "@/components/email-link";
import { Button } from "@/components/ui/button";
import { askOscar, useChat } from "@/lib/chat-store";
import { openChat } from "@/lib/drawers";
import { useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["What needs me?", "What did you handle?", "What do you know about me?"];

/**
 * Talking to Oscar. "compact" is the small card on Home: no history until you ask
 * something. "drawer" fills the Ask Oscar drawer.
 */
export function ChatPanel({ variant }: { variant: "compact" | "drawer" }) {
  const { data } = useOscar();
  const { messages, busy } = useChat();
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  // The greeting is only worth showing in the drawer; the compact card has its own intro.
  const shown = variant === "compact" ? messages.slice(1) : messages;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    setDraft("");
    void askOscar(text.trim());
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", variant === "drawer" && "flex-1")}>
      {shown.length > 0 && (
        <div ref={list} className={cn("flex flex-col gap-3 overflow-y-auto", variant === "compact" ? "max-h-80" : "min-h-0 flex-1")}>
          {shown.map((m, i) => (
            <div key={i} className={cn("flex flex-col gap-1.5", m.from === "you" ? "items-end" : "items-start")}>
              <p
                className={cn(
                  "max-w-[90%] rounded-2xl px-3.5 py-2 text-sm",
                  m.from === "you" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                )}
              >
                {m.text}
              </p>
              {!!m.decisions?.length && (
                <div className="flex max-w-[90%] flex-wrap gap-1">
                  {m.decisions.slice(0, 6).map((id) => {
                    const item = data?.items.find((i) => i.decision.id === id);
                    if (!item) return null;
                    return (
                      <EmailLink
                        key={id}
                        id={id}
                        onClick={() => openChat(false)}
                        className="max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      >
                        {item.decision.subject}
                      </EmailLink>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {busy && <p className="text-xs text-muted-foreground">Oscar is thinking...</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
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
        className="flex items-center gap-2 rounded-xl border bg-background p-1.5 pl-3 focus-within:border-ring"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Oscar or teach him a rule"
          aria-label="Ask Oscar or teach him a rule"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon-sm" disabled={busy || !draft.trim()} aria-label="Send">
          <ArrowUpIcon />
        </Button>
      </form>
    </div>
  );
}
