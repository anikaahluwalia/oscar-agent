"use client";

import { useState } from "react";
import Link from "next/link";
import { OscarAvatar } from "@/components/oscar-avatar";
import { statusCopy } from "@/components/oscar-status-header";
import { useReviewBadge } from "@/components/sidebar";
import { useLocalSetting } from "@/lib/local-setting";
import { useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

/** The on/off switch, kept on this device. Off unless you turn it on. */
export function useCompanion() {
  return useLocalSetting<"on" | "off">("companion", "off");
}

/**
 * Oscar peeking in from the edge of the screen, with a count of what needs you. Click him
 * for a short note and a link. He never bounces for a risky email: when he's stopped
 * something he sits still and says so plainly. Hidden on phones, where the tabs show the count.
 */
export function CornerCompanion() {
  const [setting] = useCompanion();
  const { data } = useOscar();
  const count = useReviewBadge();
  const [open, setOpen] = useState(false);
  if (setting !== "on" || !data) return null;

  const { lead, accent, rest, sentence, mood } = statusCopy(data.items, data.gmail.connected);
  const calmMood = mood === "alert" ? "calm" : mood;
  const label = count ? `Oscar: ${count} waiting on you` : "Oscar: nothing needs you";

  return (
    <div className="fixed right-0 bottom-24 z-30 hidden items-end gap-3 md:flex">
      {open && (
        <div role="status" className="mb-2 w-64 rounded-2xl border bg-card p-4 text-sm shadow-card">
          <p className="font-semibold">
            {lead}
            {accent}
            {rest}
          </p>
          <p className="mt-1 text-muted-foreground">{sentence}</p>
          <div className="mt-3 flex gap-2">
            {count > 0 && (
              <Link href="/review" onClick={() => setOpen(false)} className="rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground">
                Show me
              </Link>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground">
              Later
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "relative rounded-l-full border border-r-0 bg-card py-2 pr-1 pl-2 shadow-card motion-safe:transition-transform",
          !open && "translate-x-6 hover:translate-x-0 focus-visible:translate-x-0",
        )}
      >
        <OscarAvatar size={56} mood={calmMood} />
        {count > 0 && (
          <span className="absolute -top-1 left-0 min-w-5 rounded-full bg-status-needs px-1.5 text-center text-xs leading-5 font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </div>
  );
}
