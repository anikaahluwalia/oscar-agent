"use client";

import { useCallback, useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chat, type ChatMessage } from "@/components/chat";
import { LiveFeed } from "@/components/live-feed";
import { OscarAvatar } from "@/components/oscar-avatar";
import { sendChat } from "@/lib/api";
import { onOpenOscar, onShowEmail } from "@/lib/panel";
import { notifyChanged, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const GREETING: ChatMessage = {
  from: "oscar",
  text: "Hi, I'm Oscar. Ask me what needs you, why I made a call, or teach me a rule.",
};

/**
 * Oscar's side panel: Live (his working notes as emails come in) and Chat.
 * A column on wide screens; on phones, a button that opens it full screen.
 */
export function OscarPanel() {
  const { data } = useOscar();
  const [tab, setTab] = useState<"live" | "chat">("live");
  const [open, setOpen] = useState(false); // only used on small screens
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async (text: string, decisionId?: string) => {
    setBusy(true);
    setMessages((m) => [...m, { from: "you", text }]);
    try {
      const reply = await sendChat(text, decisionId);
      setMessages((m) => [...m, { from: "oscar", text: reply.reply, decisions: reply.decisions }]);
      notifyChanged(); // a rule may have changed what Oscar does
    } catch {
      setMessages((m) => [...m, { from: "oscar", text: "I can't reach my API right now." }]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(
    () =>
      onOpenOscar((request) => {
        setTab(request.tab);
        setOpen(true);
        if (request.message) void send(request.message, request.decisionId);
      }),
    [send],
  );
  // On a phone the panel covers the page, so get out of the way when a chip points at an email.
  useEffect(() => onShowEmail(() => setOpen(false)), []);

  const items = data?.items ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Oscar"
        className={cn(
          "fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full border bg-card py-1.5 pr-4 pl-1.5 shadow-lg lg:hidden",
          open && "hidden",
        )}
      >
        <OscarAvatar size={32} />
        <span className="text-sm font-medium">Live · Chat</span>
      </button>

      <aside
        className={cn(
          "flex-col border-l bg-background",
          "lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-[360px] lg:shrink-0",
          open ? "fixed inset-0 z-40 flex" : "hidden",
        )}
      >
        <div className="flex items-center gap-1 border-b p-3">
          {(["live", "chat"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1 text-sm",
                tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "live" && <span className="size-1.5 animate-pulse rounded-full bg-level-silent" />}
              {t === "live" ? "Live" : "Chat"}
            </button>
          ))}
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden" aria-label="Close" onClick={() => setOpen(false)}>
            <XIcon />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {tab === "live" ? (
            <LiveFeed items={items} ready={!!data} />
          ) : (
            <Chat items={items} messages={messages} busy={busy} onSend={(text) => send(text)} />
          )}
        </div>
      </aside>
    </>
  );
}
