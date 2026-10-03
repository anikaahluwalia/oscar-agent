import { ChevronRightIcon } from "lucide-react";
import { labelName, notesOverclaim } from "@/components/activity/outcome";
import type { DecisionWithFeedback } from "@/lib/api";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-mono text-xs leading-5 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** The raw record behind a decision: his working notes and the ids, for checking his work. */
export function TechnicalDetails({ item }: { item: DecisionWithFeedback }) {
  const { decision: d, done, feedback } = item;
  const aheadOfGmail = notesOverclaim(d, done, feedback);
  return (
    <details className="group rounded-xl border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        Technical details
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4 text-sm">
        {d.steps.length > 0 && (
          <section className="flex flex-col gap-2">
            <h4 className="font-medium">His working notes</h4>
            {aheadOfGmail && (
              <p className="text-muted-foreground">Written as he decided, before anything happened. The Outcome above says what really happened.</p>
            )}
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
              {d.steps.map((step, n) => (
                <li key={n}>{step}</li>
              ))}
            </ol>
          </section>
        )}
        <dl className="divide-y">
          <Row label="Matched pattern">{d.matched_pattern ?? "None"}</Row>
          <Row label="Kind of email">{d.email_type ?? "unknown"}</Row>
          <Row label="Understood by">{d.understood_by ?? (d.matched_pattern ? "Not recorded (a rule matched)" : "nothing (a guess)")}</Row>
          <Row label="Level set by">{d.level_source}</Row>
          {d.confidence !== undefined && (
            <Row label="Confidence score">
              {d.confidence.toFixed(2)}
              <span className="block font-sans text-muted-foreground">
                Set by how the level was decided. It isn&apos;t a measured accuracy.
              </span>
            </Row>
          )}
          <Row label="Policy version">{d.policy_version ?? "Not recorded"}</Row>
          <Row label="Inbox">{d.source === "gmail" ? `Gmail${d.acting ? ", acting on" : ", read only"}` : "Demo"}</Row>
          <Row label="Decision id">{d.id}</Row>
          <Row label="Email id">{d.email_id}</Row>
          {d.gmail && (
            <>
              <Row label="Gmail message id">{d.gmail.message_id}</Row>
              <Row label="Gmail labels">{d.gmail.labels.length ? d.gmail.labels.join(", ") : "None"}</Row>
              {d.gmail.category && <Row label="Gmail category">{d.gmail.category}</Row>}
              <Row label="Emails in thread">{d.gmail.thread_length}</Row>
            </>
          )}
          {d.action === "APPLY_LABEL" && d.source === "gmail" && <Row label="Oscar's label">{labelName(d)}</Row>}
          {done && (
            <>
              <Row label="Gmail action id">{done.id}</Row>
              <Row label="Labels added">{done.added.length ? done.added.join(", ") : "None"}</Row>
              <Row label="Labels removed">{done.removed.length ? done.removed.join(", ") : "None"}</Row>
              <Row label="Done at">{done.done_at}</Row>
              {done.undone_at && <Row label="Undone at">{done.undone_at}</Row>}
            </>
          )}
          <Row label="Decided at">{d.created_at}</Row>
        </dl>
      </div>
    </details>
  );
}
