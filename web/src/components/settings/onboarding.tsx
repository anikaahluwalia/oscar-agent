"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { CheckIcon, XIcon } from "lucide-react";
import { OscarMood } from "@/components/oscar-mood";
import { Button } from "@/components/ui/button";
import { gmailConnectUrl } from "@/lib/api";
import { bringInDemo } from "@/lib/demo";
import { useLocalSetting } from "@/lib/local-setting";
import { useOscar } from "@/lib/use-oscar";

const POINTS = ["Handles routine emails", "Learns from your feedback", "Always follows safety rules"];

/**
 * "Meet Oscar!": shown once, on a brand-new setup. Only while Gmail isn't connected, there are no
 * emails yet, and you haven't closed it. Closing it (or picking either button) hides it for good on this browser.
 */
export function Onboarding() {
  const { data } = useOscar();
  const [seen, setSeen] = useLocalSetting<"yes" | "no">("onboarding-seen", "no");
  const close = useCallback(() => setSeen("yes"), [setSeen]);
  const show = !!data && !data.gmail.connected && data.all.length === 0 && seen === "no";
  if (!show) return null;
  return <MeetOscar canConnect={data.gmail.configured} onClose={close} />;
}

function MeetOscar({ canConnect, onClose }: { canConnect: boolean; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    // Focus the card itself, so screen readers start at the title and Tab goes to the buttons next.
    card.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Keep Tab inside the card while it's open.
      if (e.key !== "Tab" || !card.current) return;
      const focusable = Array.from(card.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm dark:bg-black/60 animate-in fade-in-0"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meet-oscar-title"
        aria-describedby="meet-oscar-text"
        tabIndex={-1}
        className="relative my-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border bg-card px-6 pt-7 pb-6 text-center shadow-card outline-none animate-in zoom-in-95 fade-in-0"
      >
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="absolute top-2 right-2 size-11 rounded-full text-muted-foreground">
          <XIcon className="size-5" />
        </Button>

        {/* He is asking: connect Gmail, or try the examples first? */}
        <OscarMood pose="asking" size={120} />

        <div className="flex flex-col gap-2">
          <h2 id="meet-oscar-title" className="text-2xl font-extrabold tracking-[-0.03em]">
            Meet Oscar!
          </h2>
          <p id="meet-oscar-text" className="text-sm text-muted-foreground">
            Your proactive email agent. He learns what you prefer, but some rules are never negotiable.
          </p>
        </div>

        <ul className="flex flex-col gap-2.5 self-stretch text-left text-sm">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-2.5">
              <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                <CheckIcon className="size-3.5" strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 self-stretch">
          {canConnect ? (
            <Button asChild className="h-11 w-full text-sm font-semibold">
              <a href={gmailConnectUrl} onClick={onClose}>
                Connect Gmail
              </a>
            </Button>
          ) : (
            <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              To use your real inbox, add your Google keys to <code>.env</code> first.{" "}
              <Link href="/settings" onClick={onClose} className="font-semibold text-foreground underline underline-offset-4 hover:no-underline">
                Settings shows how.
              </Link>
            </p>
          )}
          <Button
            variant={canConnect ? "outline" : "default"}
            className="h-11 w-full text-sm font-semibold"
            onClick={() => {
              onClose();
              void bringInDemo();
            }}
          >
            Try the demo inbox
          </Button>
        </div>
      </div>
    </div>
  );
}
