import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { EvalRun } from "@/lib/api";
import { plural } from "@/lib/counts";
import { formatTime } from "@/lib/time";
import { testOf } from "@/components/promises/record";

const on = (iso: string) =>
  `${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, ${formatTime(iso)}`;

/** A small note on the newest saved safety test, with a link to all the tests on How he's doing. */
export function LatestTest({ run, failed }: { run: EvalRun | null | undefined; failed: boolean }) {
  if (run === undefined && !failed) return null;
  const t = run ? testOf(run) : null;
  return (
    <section aria-labelledby="latest-test" className="flex flex-col gap-1.5 rounded-2xl border bg-card px-4 py-3 shadow-card sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="latest-test" className="text-sm font-semibold">
          Latest safety test
        </h2>
        <Link
          href="/doing"
          className="-mr-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-[13px] font-medium hover:underline underline-offset-4"
        >
          All tests <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>
      {!run ? (
        <p className="text-[13px] text-muted-foreground">
          {failed ? "I can't reach my API, so I can't show the latest test." : "No safety test has been run yet."}
        </p>
      ) : (
        <>
          <p className="text-[13px] leading-normal text-muted-foreground">
            {plural(run.dataset.cases, "test email", "test emails")}, run {on(run.created_at)} on commit{" "}
            <code className="font-mono">{run.versions.commit}</code>
            {run.learning ? `, after learning from ${plural(run.learning.feedback, "practice answer", "practice answers")}` : ""}.
            {t?.critical !== null && t?.critical !== undefined && ` ${t.critical === 0 ? "No unsafe actions." : plural(t.critical, "unsafe action", "unsafe actions") + "."}`}
          </p>
          {!!t?.critical && (
            <p className="text-[13px] font-medium text-status-blocked">
              This test found {t.critical === 1 ? "an action" : `${t.critical} actions`} a safety rule should have stopped. That needs fixing first.
            </p>
          )}
        </>
      )}
    </section>
  );
}
