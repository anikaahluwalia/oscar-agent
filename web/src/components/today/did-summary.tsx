import Link from "next/link";
import { OscarAvatar } from "@/components/oscar-avatar";
import type { Action } from "@/lib/api";

// How each action reads in a sentence: "archived 9", "marked 5 as read".
const DID: Partial<Record<Action, (n: number) => string>> = {
  ARCHIVE: (n) => `archived ${n.toLocaleString()}`,
  MARK_READ: (n) => `marked ${n.toLocaleString()} as read`,
  APPLY_LABEL: (n) => `labelled ${n.toLocaleString()}`,
  DRAFT_REPLY: (n) => `drafted ${n.toLocaleString()} ${n === 1 ? "reply" : "replies"}`,
};
const WOULD: Partial<Record<Action, (n: number) => string>> = {
  ARCHIVE: (n) => `archived ${n.toLocaleString()}`,
  MARK_READ: (n) => `marked ${n.toLocaleString()} as read`,
  APPLY_LABEL: (n) => `labelled ${n.toLocaleString()}`,
  DRAFT_REPLY: (n) => `drafted ${n.toLocaleString()} ${n === 1 ? "reply" : "replies"}`,
};

function list(parts: React.ReactNode[]) {
  return parts.flatMap((p, i) => (i === 0 ? [p] : [i === parts.length - 1 ? " and " : ", ", p]));
}

/** One sentence from Oscar on what he did today, each part opening those emails in Inbox. */
export function DidSummary({ chips, readOnly }: { chips: { action: Action; n: number }[]; readOnly: boolean }) {
  const words = readOnly ? WOULD : DID;
  const parts = chips
    .filter((c) => words[c.action])
    .map((c) => (
      <Link key={c.action} href="/inbox" className="font-bold underline-offset-4 hover:underline">
        {words[c.action]!(c.n)}
      </Link>
    ));
  return (
    <section aria-labelledby="did-today" className="flex flex-col gap-3">
      <h2 id="did-today" className="text-lg font-bold">
        {readOnly ? "What I'd have done today" : "What I did today"}
      </h2>
      <div className="flex items-start gap-3.5 rounded-[20px] border bg-card px-5 py-4">
        <OscarAvatar size={36} />
        <p className="text-base leading-relaxed">
          {parts.length ? (
            <>
              {readOnly ? "I'd have " : "I "}
              {list(parts)}. Nothing needed you.{" "}
              <span className="text-muted-foreground">
                {readOnly ? "I only read Gmail for now, so nothing changed in it." : "You can undo any of them in your Inbox."}
              </span>
            </>
          ) : (
            "Nothing new came in that I handled today. Nothing needs you either."
          )}
        </p>
      </div>
    </section>
  );
}
