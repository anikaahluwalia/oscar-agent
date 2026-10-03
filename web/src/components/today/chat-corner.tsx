"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { OscarMood } from "@/components/oscar-mood";
import { useLocalSetting } from "@/lib/local-setting";
import { cn } from "@/lib/utils";

const HINT_VISITS = 3; // visits to Today that show the "Want to chat?" bubble on its own

/**
 * Oscar in the corner of Today, so the chat is one click away. On your first few visits his
 * "Want to chat?" bubble shows on its own, so you learn he's there. After that it only shows when
 * you point at him (or tab to him), so it never sits on top of the cards underneath. The count is
 * kept in this browser only.
 */
export function ChatCorner() {
  const [visits, setVisits] = useLocalSetting<string>("chat-hint-visits", "");
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    let seen = 0;
    try {
      seen = Number(window.localStorage.getItem("oscar.chat-hint-visits")) || 0;
    } catch {
      // Storage can be blocked in a private window: he just shows the bubble on hover.
    }
    setVisits(String(seen + 1));
  }, [setVisits]);
  // Empty until this visit is counted, so a returning visitor never sees it flash up and away.
  const hint = visits !== "" && Number(visits) <= HINT_VISITS;

  return (
    <Link
      href="/chat"
      aria-label="Chat with Oscar"
      className="group fixed right-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-end gap-1 md:right-3 md:bottom-6"
    >
      <span
        className={cn(
          "hidden w-44 rounded-2xl rounded-br-sm border bg-card px-3.5 py-2.5 text-sm leading-snug shadow-card transition-colors group-hover:bg-surface-hover md:group-hover:block md:group-focus-visible:block",
          hint && "md:block",
        )}
      >
        <b className="font-bold">Want to chat?</b>
        <span className="block text-muted-foreground">Ask me anything about your email.</span>
      </span>
      <span className="relative">
        <OscarMood pose="typing" size={72} decorative className="size-16 transition-transform group-hover:-translate-y-0.5 md:size-[72px]" />
        {/* A small chat sign on him whenever the bubble isn't showing on its own. */}
        <span
          aria-hidden
          className={cn(
            "absolute -top-1 -left-1 flex size-7 items-center justify-center rounded-full border bg-card shadow-card md:group-hover:hidden",
            hint && "md:hidden",
          )}
        >
          <MessageCircleIcon className="size-3.5" />
        </span>
      </span>
    </Link>
  );
}
