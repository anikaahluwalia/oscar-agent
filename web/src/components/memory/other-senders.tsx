"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { lockFor } from "@/components/ladder";
import { decisionFor, onlyWould, senderParts } from "@/components/memory/facts";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type { FeedbackKind } from "@/lib/api";
import { ACTIONS } from "@/lib/labels";
import type { OscarData } from "@/lib/use-oscar";

/** Senders Oscar has seen but hasn't learned anything about, so you can set a rule before he does. */
export function OtherSenders({
  data,
  onFeedback,
}: {
  data: OscarData;
  onFeedback: (decisionId: string, kind: FeedbackKind) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const learned = new Set(data.learned.map((r) => `${r.sender}|${r.action}`));
  const rows = data.autonomy
    .filter((r) => r.level !== "ESCALATE" && r.floor !== "ESCALATE" && !learned.has(`${r.sender}|${r.action}`))
    .flatMap((r) => {
      const pick = decisionFor(data, r.sender, r.action, r);
      if (!pick) return [];
      const canDoMore = !pick.flagged && r.level !== "PROCEED_SILENTLY" && !lockFor(r, "PROCEED_AND_NOTIFY");
      const canAsk = r.level !== "ASK_FIRST";
      // Only senders where at least one button would change something.
      return canDoMore || canAsk ? [{ row: r, decisionId: pick.id, canDoMore, canAsk }] : [];
    });
  if (!rows.length) return null;

  const send = async (decisionId: string, kind: FeedbackKind) => {
    if (busy) return;
    setBusy(true);
    await onFeedback(decisionId, kind);
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="memory-other-senders"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDownIcon className={open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} aria-hidden />
        Set a rule for one of {rows.length} other {rows.length === 1 ? "sender" : "senders"}
      </button>
      {open && (
        <ul id="memory-other-senders" className="flex flex-col divide-y rounded-2xl border bg-card shadow-card">
          {rows.map(({ row, decisionId, canDoMore, canAsk }) => {
            const { name } = senderParts(row.sender);
            return (
              <li key={`${row.sender}|${row.action}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium" title={row.sender}>
                    {name}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {ACTIONS[row.action]} · nothing learned yet
                    <StatusPill level={row.level} readOnly={onlyWould(data, row.action)} />
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canDoMore && (
                    <Button variant="outline" className="h-11 px-4 sm:h-9" disabled={busy} onClick={() => send(decisionId, "ALWAYS_DO_THIS")}>
                      Always do this
                    </Button>
                  )}
                  {canAsk && (
                    <Button variant="outline" className="h-11 px-4 sm:h-9" disabled={busy} onClick={() => send(decisionId, "ALWAYS_ASK_ME")}>
                      Always ask me
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
