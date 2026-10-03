import { PenLineIcon } from "lucide-react";
import type { DecisionWithFeedback } from "@/lib/api";

/**
 * The reply Oscar wrote, saved as a draft in Gmail (oscar/act.py draft). Shown until it's undone, with
 * a way to open it there. He never sends it: you edit and send it yourself, or delete it.
 */
export function DraftBox({ item }: { item: DecisionWithFeedback }) {
  const done = item.done;
  if (!done || done.undone_at || !done.draft_text) return null;
  return (
    <section aria-label="The draft I wrote" className="flex flex-col gap-2.5 rounded-2xl border bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <PenLineIcon className="size-4 text-muted-foreground" aria-hidden /> My draft, waiting in Gmail
        </p>
        <a
          href="https://mail.google.com/mail/u/0/#drafts"
          target="_blank"
          rel="noopener"
          className="text-[13px] font-semibold underline underline-offset-4 hover:no-underline"
        >
          Open Drafts in Gmail
        </a>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{done.draft_text}</p>
      <p className="text-xs text-muted-foreground">Nothing is sent until you send it. Undo deletes this draft.</p>
    </section>
  );
}
