"use client";

import { useId, useState } from "react";
import { CheckIcon, CopyIcon, TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const COMMANDS = [
  { command: "python -m evals.measure", what: "The rules alone." },
  { command: "python -m evals.measure --model fill", what: "The model reads what the rules miss. Needs GEMINI_API_KEY in .env." },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : `Copy ${text}`}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        )
      }
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
    >
      {copied ? <CheckIcon className="size-4 text-status-handled" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}
    </button>
  );
}

/** The page can't run the tests itself, so this shows the commands to run from the repo folder. */
export function HowToRun() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
      <Button size="lg" className="min-h-11 px-4" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <TerminalIcon aria-hidden /> How to run
      </Button>
      {open && (
        <div id={id} className="flex w-full max-w-md flex-col gap-3 rounded-2xl border bg-card p-4 text-sm shadow-card">
          <p className="text-muted-foreground">
            Run one of these from the repo folder, then refresh this page. Each run saves its results to evals/results/runs.
          </p>
          <ul className="flex flex-col gap-2">
            {COMMANDS.map((c) => (
              <li key={c.command} className="flex flex-col gap-1">
                <div className="flex items-center gap-1 rounded-lg bg-muted pl-3">
                  <code className="min-w-0 flex-1 overflow-x-auto py-2 font-mono text-xs whitespace-nowrap">{c.command}</code>
                  <CopyButton text={c.command} />
                </div>
                <span className="text-xs text-muted-foreground">{c.what}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
