import Link from "next/link";
import { ArrowRightIcon, CalendarIcon, CheckIcon } from "lucide-react";
import { InboxLink } from "@/components/inbox/inbox-link";
import { formatTime } from "@/lib/time";
import type { ActivityRow } from "@/components/today/words";

const SHOWN = 5;

function Row({ row }: { row: ActivityRow }) {
  const body = (
    <>
      <span
        aria-hidden
        className={
          row.type === "reminder"
            ? "grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
            : "grid size-10 shrink-0 place-items-center rounded-xl bg-status-handled/12 text-status-handled"
        }
      >
        {row.type === "reminder" ? <CalendarIcon className="size-[18px]" /> : <CheckIcon className="size-[18px]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{row.title}</span>
        <span className="truncate text-sm text-muted-foreground">{row.detail}</span>
      </span>
      <span className="shrink-0 self-start pt-0.5 text-[13px] text-muted-foreground tabular-nums">{formatTime(new Date(row.at).toISOString())}</span>
    </>
  );
  const cls = "flex items-center gap-3.5 py-3 sm:rounded-xl sm:px-2 hover:bg-surface-hover";
  return (
    <li className="border-t first:border-t-0">
      {row.type === "reminder" ? (
        <InboxLink id={row.id} className={cls}>
          {body}
        </InboxLink>
      ) : (
        // That email (the newest in the group) open, with the rest of what he took care of beside it.
        <Link href={`/inbox?show=done#${row.id}`} className={cls}>
          {body}
        </Link>
      )}
    </li>
  );
}

/** What Oscar took care of today, grouped and newest first, each group opening its newest email in your Inbox. */
export function ActivityCard({ rows, readOnly }: { rows: ActivityRow[]; readOnly: boolean }) {
  return (
    <section aria-labelledby="took-care" className="flex flex-col rounded-[24px] border bg-card px-5 py-5 sm:px-6">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id="took-care" className="text-lg font-bold">
          {readOnly ? "What I'd have taken care of today" : "What I took care of today"}
        </h2>
        {rows.length > 0 && (
          <Link href="/inbox?show=done" className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-status-fyi underline-offset-4 hover:underline">
            See all <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {rows.length ? (
        <>
          <ul className="flex flex-col">
            {rows.slice(0, SHOWN).map((row) => (
              <Row key={row.key} row={row} />
            ))}
          </ul>
          {readOnly && <p className="mt-2 text-[13px] text-muted-foreground">I&apos;m only reading Gmail for now, so nothing changed in it.</p>}
        </>
      ) : (
        <p className="py-6 text-[15px] text-muted-foreground">Nothing yet today.</p>
      )}
    </section>
  );
}
