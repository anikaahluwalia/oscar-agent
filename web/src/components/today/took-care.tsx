import Link from "next/link";
import { LevelDot } from "@/components/kit/status";
import type { Action } from "@/lib/api";

type Chip = { action: Action; label: string };

/** What Oscar took care of today, one chip per action, each opening your Inbox. */
export function TookCare({ chips, readOnly }: { chips: Chip[]; readOnly: boolean }) {
  return (
    <section aria-labelledby="took-care" className="flex flex-col gap-2 sm:gap-3">
      <h2 id="took-care" className="text-sm font-semibold text-muted-foreground sm:text-[15px]">
        {readOnly ? "What I'd have taken care of today" : "What I took care of today"}
      </h2>
      {chips.length ? (
        <>
          {/* On a phone it's one line, "Marked 23 as read · Archived 8"; wider, a row of chips. */}
          <ul className="flex flex-wrap items-center sm:gap-2">
            {chips.map((c, i) => (
              <li key={c.action} className="flex items-center not-last:after:mx-2 not-last:after:text-muted-foreground not-last:after:content-['·'] sm:not-last:after:hidden">
                <Link
                  href="/inbox"
                  className="inline-flex min-h-11 items-center gap-2 text-base underline-offset-4 hover:underline sm:min-h-10 sm:rounded-full sm:border sm:border-input sm:bg-card sm:px-4 sm:text-sm sm:font-semibold sm:hover:bg-surface-hover sm:hover:no-underline"
                >
                  {i === 0 && <LevelDot level="PROCEED_SILENTLY" />}
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "I'm only reading Gmail for now, so I didn't change anything. They're all in your Inbox."
              : "They're all in your Inbox, where you can undo any of them."}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing yet today.</p>
      )}
    </section>
  );
}
