"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorPlayIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A short recording of the Chrome extension in Gmail, in web/public. If it ever goes missing,
// the window says it's on its way instead of showing a broken player.
const VIDEO = "/oscar-in-gmail.mp4";
const OPEN = "oscar:gmail-preview";

/** Opens the "See it in Gmail" window from anywhere (the sidebar, or the phone's More menu). */
export const openGmailPreview = () => window.dispatchEvent(new Event(OPEN));

/** The button, styled like the pages beside it. */
export function SeeItInGmail({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        openGmailPreview();
      }}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <MonitorPlayIcon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
      <span className="flex-1">See it in Gmail</span>
    </button>
  );
}

/**
 * What Oscar looks like inside Gmail, for anyone who hasn't installed the extension: a short video
 * that plays on a loop, with no sound, in a window over the app. Esc or the close button shuts it.
 */
export function GmailPreview() {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} />
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gmail-preview-title"
        className="relative flex w-full max-w-3xl flex-col gap-3 rounded-3xl border bg-card p-4 shadow-card outline-none sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="gmail-preview-title" className="text-lg font-bold">
            Oscar in Gmail
          </h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-surface-hover">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className={cn("overflow-hidden rounded-2xl border bg-muted", missing && "flex aspect-video items-center justify-center")}>
          {missing ? (
            <p className="px-6 text-center text-sm text-muted-foreground">The video of me in Gmail is on its way. Check back soon!</p>
          ) : (
            <video
              src={VIDEO}
              autoPlay
              muted
              loop
              playsInline
              onError={() => setMissing(true)}
              aria-label="A short recording of Oscar's Chrome extension in Gmail"
              className="block h-auto w-full"
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          My Chrome extension puts my call right inside Gmail: a chip on each email, and my note beside the one you open.
        </p>
      </div>
    </div>
  );
}
