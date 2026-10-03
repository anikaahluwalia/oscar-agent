"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { lockFor } from "@/components/ladder";
import { displayName, SenderAvatar } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import { decisionFor, memoryItems, notInGmail, onlyWould } from "@/components/memory/facts";
import { Button } from "@/components/ui/button";
import type { FeedbackKind } from "@/lib/api";
import { ACTIONS, statusLabel } from "@/lib/labels";
import { isReadOnly, type OscarData } from "@/lib/use-oscar";
import { firstAnswer, forgotAt, startedAgo } from "./facts";
import { HabitRow } from "./habit-row";

type Send = (decisionId: string, kind: FeedbackKind) => Promise<unknown>;

/** Which inbox this is, and what that means for what he learns. Kept from the old Memory page. */
function inboxNote(data: OscarData) {
  if (!data.gmail.connected) return "This is the example inbox. What I learn here stays here, apart from your real inbox.";
  const reviews = "On your real inbox I learn from your reviews too. Each answer teaches me about that sender.";
  return isReadOnly(data) ? `${reviews} I'm only reading your email for now, so this is what I would do.` : reviews;
}

/** Senders Oscar has seen but learned nothing about, so you can set a rule before he does. */
function OtherSenders({ data, onFeedback }: { data: OscarData; onFeedback: Send }) {
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
    <div className="flex flex-col gap-1 border-t pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="knows-other-senders"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 self-start rounded-xl text-[13px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronDownIcon className={open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} aria-hidden />
        Set a rule for one of {rows.length} other {rows.length === 1 ? "sender" : "senders"}
      </button>
      {open && (
        <ul id="knows-other-senders" className="flex flex-col">
          {rows.map(({ row, decisionId, canDoMore, canAsk }) => {
            const name = displayName(row.sender);
            return (
              <li key={`${row.sender}|${row.action}`} className="flex gap-3.5 border-t py-3.5 first:border-t-0">
                <SenderAvatar sender={row.sender} size={32} />
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-[15px] font-medium" title={row.sender}>
                      {name}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
                      {ACTIONS[row.action]} · nothing learned yet
                      <StatusWords level={row.level}>{statusLabel(row.level, onlyWould(data, row.action))}</StatusWords>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canDoMore && (
                      <Button
                        variant="outline"
                        className="h-11 rounded-full px-3 text-[13px] font-semibold sm:h-9"
                        disabled={busy}
                        aria-label={`Always do this, ${name}`}
                        onClick={() => send(decisionId, "ALWAYS_DO_THIS")}
                      >
                        Always do this
                      </Button>
                    )}
                    {canAsk && (
                      <Button
                        variant="outline"
                        className="h-11 rounded-full px-3 text-[13px] font-semibold sm:h-9"
                        disabled={busy}
                        aria-label={`Always ask, ${name}`}
                        onClick={() => send(decisionId, "ALWAYS_ASK_ME")}
                      >
                        Always ask
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One row per thing Oscar learned about a sender, then the senders he hasn't learned about yet. */
export function SendersIKnow({ data, onFeedback, now }: { data: OscarData; onFeedback: Send; now: number }) {
  const forgot = forgotAt(data.all);
  // What he does on his own first, then the senders he asks about.
  const items = memoryItems(data).sort((a, b) => Number(a.asks) - Number(b.asks));

  return (
    <section aria-labelledby="knows-senders" className="flex flex-col">
      <h2 id="knows-senders" className="mb-1 text-lg font-bold">
        Senders I know
      </h2>
      <p className="mb-2 text-[13px] text-muted-foreground">
        Each okay brings me closer to doing it on my own. A no or an undo steps me back. {inboxNote(data)}
      </p>

      {items.length ? (
        <ul className="flex flex-col">
          {items.map((item) => {
            const { sender, action } = item.learned;
            const first = firstAnswer(data.all, sender, action, forgot);
            return (
              <HabitRow
                key={`${sender}|${action}`}
                item={item}
                would={onlyWould(data, action)}
                outsideGmail={notInGmail(data, action)}
                started={first ? startedAgo(first, now) : null}
                onFeedback={onFeedback}
              />
            );
          })}
        </ul>
      ) : (
        <div className="mt-2 flex flex-col gap-1 rounded-2xl border border-dashed px-5 py-6">
          <p className="font-semibold">Nothing learned yet</p>
          <p className="text-[13px] text-muted-foreground">
            {data.gmail.connected
              ? "Every okay, decline, undo and review teaches me a little about how you like things done. What I pick up shows here."
              : "Every okay, decline and undo teaches me a little about how you like things done. What I pick up shows here."}
          </p>
        </div>
      )}

      <div className="mt-2">
        <OtherSenders data={data} onFeedback={onFeedback} />
      </div>
    </section>
  );
}
