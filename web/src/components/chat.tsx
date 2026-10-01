"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OscarAvatar } from "@/components/oscar-avatar";
import type { DecisionWithFeedback } from "@/lib/api";
import { showEmail } from "@/lib/panel";
import { isDone } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

export type ChatMessage = { from: "you" | "oscar"; text: string; decisions?: string[] };

const SUGGESTIONS = ["What needs me?", "What did you handle?", "What do you know about me?"];

/** Where an email lives in the app: open ones on Home, finished ones in Activity. */
function hrefFor(item: DecisionWithFeedback) {
  return `${isDone(item) ? "/activity" : "/"}#${item.decision.id}`;
}

type Props = {
  items: DecisionWithFeedback[];
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
};

export function Chat({ items, messages, busy, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  // Braces matter: scrollIntoView returns a Promise in newer browsers, and an effect must not return one.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    setDraft("");
    onSend(text.trim());
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.from === "you" && "justify-end")}>
            {m.from === "oscar" && <OscarAvatar size={24} className="mt-1" />}
            <div className="flex max-w-[85%] flex-col gap-1.5">
              <p
                className={cn(
                  "rounded-2xl px-3 py-2 text-sm",
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
                      <Link key={id} href={hrefFor(item)} onClick={() => showEmail(id)} className="max-w-full truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                        {item.decision.subject}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-1.5 py-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => send(s)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2 rounded-2xl border bg-card p-1.5 pl-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Oscar or teach him a rule"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
          <ArrowUpIcon />
        </Button>
      </form>
    </div>
  );
}
