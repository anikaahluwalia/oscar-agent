import { InboxLink } from "@/components/inbox/inbox-link";
import type { EvalRun } from "@/lib/api";
import { plural } from "@/lib/counts";
import { whatOscarDid } from "@/lib/labels";
import type { OscarData } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";
import { DAYS, recordOf, testOf } from "@/components/promises/record";

/** What the latest safety test found, as the end of a sentence. Null when there's nothing to say. */
function testPart(run: EvalRun | null | undefined) {
  if (!run) return null;
  const { risky, caught } = testOf(run);
  if (risky === null || caught === null) return null;
  return {
    ok: caught === risky,
    text: caught === risky ? `caught every one of ${plural(risky, "risky test email", "risky test emails")}` : `caught ${caught.toLocaleString()} of ${plural(risky, "risky test email", "risky test emails")}`,
  };
}

/**
 * One line from real numbers only: how many risky emails Oscar acted on in the last 30 days
 * (should be none) and, when a safety test has been saved, how many risky test emails it caught.
 */
export function RecordLine({ data, readOnly, run }: { data: OscarData; readOnly: boolean; run: EvalRun | null | undefined }) {
  const r = recordOf(data);
  const acted = r.actedOn.length;
  const test = testPart(run);
  const good = acted === 0 && (!test || test.ok) && !(run && testOf(run).critical);

  let line: React.ReactNode;
  if (acted > 0) {
    line = (
      <>
        In the last {DAYS} days I acted on {plural(acted, "risky email", "risky emails")}. That should never happen, so please look at{" "}
        {acted === 1 ? "it" : "each one"}:{" "}
        {r.actedOn.map((i, n) => (
          <span key={i.decision.id}>
            {n > 0 && ", "}
            <InboxLink id={i.decision.id} className="font-medium text-status-blocked underline underline-offset-4">
              {whatOscarDid(i.decision, i.done)}: {i.decision.subject || "(no subject)"}
            </InboxLink>
          </span>
        ))}
        .{test && ` My latest safety test ${test.text}.`}
      </>
    );
  } else if (r.emails === 0) {
    line = `No emails in the last ${DAYS} days yet.${test ? ` My latest safety test ${test.text}.` : ""}`;
  } else {
    const where = readOnly ? " (I only read your Gmail for now)" : "";
    line = test
      ? `In the last ${DAYS} days I acted on 0 risky emails${where}, and my latest safety test ${test.text}.`
      : `In the last ${DAYS} days I acted on 0 risky emails${where}.`;
  }

  return (
    <div className="flex flex-col gap-2 text-[13px] leading-normal text-muted-foreground">
      <p className="flex items-start gap-2">
        <span aria-hidden className={cn("mt-[0.4rem] size-2 shrink-0 rounded-full", good ? "bg-level-silent" : "bg-level-escalate")} />
        <span>{line}</span>
      </p>
      {r.pushed > 0 && (
        <p className="pl-4">
          You tried to teach me past one of these {r.pushed === 1 ? "once" : `${r.pushed.toLocaleString()} times`} in the last {DAYS} days. I
          kept my promise {r.pushed === 1 ? "" : "each time "}and didn&apos;t learn from it.
        </p>
      )}
    </div>
  );
}
