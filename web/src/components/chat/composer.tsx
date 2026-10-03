import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import { askOscar } from "@/lib/chat-store";

// Things the chat can answer even without the model (oscar/chat.py).
const SUGGESTIONS = ["What's waiting on me?", "What did you handle today?", "What do you know about me?"];

/** Suggestions, the box you type in, and what Oscar can and can't do. */
export function Composer({ busy }: { busy: boolean }) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef(false);

  // The box is off while Oscar writes back; put you back in it after.
  useEffect(() => {
    if (!busy && typed.current) {
      typed.current = false;
      input.current?.focus();
    }
  }, [busy]);

  function send(text: string, fromBox: boolean) {
    if (!text.trim() || busy) return;
    typed.current = fromBox;
    if (fromBox) setDraft("");
    void askOscar(text.trim());
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* One row that scrolls sideways on phones, so the box stays close to the messages. */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => send(s, false)}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-input bg-card px-4 text-sm font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50 sm:min-h-10"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft, true);
        }}
        className="flex items-center gap-2 rounded-full border bg-card py-1.5 pr-1.5 pl-[22px] focus-within:border-ring"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message Oscar
        </label>
        <input
          id="chat-input"
          ref={input}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Oscar, or tell him how to handle something"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || !draft.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:bg-primary/80 disabled:opacity-50"
        >
          <ArrowUpIcon className="size-[18px]" strokeWidth={2.2} />
        </button>
      </form>
      <p className="text-center text-[13px] text-muted-foreground">I can sort, label and archive. I never send, delete or unsubscribe.</p>
    </div>
  );
}
