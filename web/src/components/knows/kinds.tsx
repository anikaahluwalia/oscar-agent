"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { StatusWords } from "@/components/kit/status";
import { notInGmail } from "@/components/memory/facts";
import type { Level, PermissionRow } from "@/lib/api";
import { KIND_NAMES } from "@/lib/labels";
import { isReadOnly, type OscarData } from "@/lib/use-oscar";
import { forgotAt, kindAnswers, sentence, startWords } from "./facts";

const ORDER: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"];
const nameOf = (r: PermissionRow) => KIND_NAMES[r.email_type] ?? r.email_type.replace(/_/g, " ");

/** "9 of your answers so far, about 4 senders". Per kind they don't move where a new sender starts. */
function answersLine(answers: number, senders: number) {
  const about = `about ${senders} ${senders === 1 ? "sender" : "senders"}`;
  return `${answers === 1 ? "1 answer" : `${answers} of your answers`} so far, ${about}`;
}

/** Where learning can't go: what always waits for you or always tells you, whatever you teach him. */
function limitLine(r: PermissionRow) {
  if (r.floor === "ASK_FIRST") return `Always asks first: ${r.reason}`;
  if (r.ceiling === "PROCEED_AND_NOTIFY") return "Never quietly: I always give you a heads up on these";
  return null;
}

/** Where Oscar starts with each kind of email from a sender he doesn't know yet, and what your answers add up to. */
export function KindsOfEmail({ data, rules, failed }: { data: OscarData; rules: PermissionRow[] | null; failed: boolean }) {
  const forgot = forgotAt(data.all);
  const open = (rules ?? []).filter((r) => r.floor !== "ESCALATE").sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const stopped = (rules ?? []).filter((r) => r.floor === "ESCALATE");

  return (
    <section aria-labelledby="knows-kinds" className="flex flex-col">
      <h2 id="knows-kinds" className="mb-1 text-lg font-bold">
        Kinds of email
      </h2>
      <p className="mb-2 text-[13px] text-muted-foreground">
        For senders I don&apos;t know yet. Each kind starts where my rules put it. I learn from your answers one sender at a time, so
        what you teach me shows up under Senders I know, and a new sender still starts here.
        {isReadOnly(data) && " I'm only reading your email for now, so this is what I would do."}
      </p>

      {failed ? (
        <p className="border-t py-3.5 text-[13px] text-muted-foreground">I can&apos;t reach my API, so I can&apos;t show my rules.</p>
      ) : !rules ? (
        <p className="border-t py-3.5 text-[13px] text-muted-foreground">Getting my rules...</p>
      ) : (
        <ul className="flex flex-col">
          {open.map((r) => {
            const { answers, senders } = kindAnswers(data.all, r.email_type, forgot);
            const limit = limitLine(r);
            return (
              <li key={r.action} className="flex flex-col gap-1.5 border-t py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-[15px]">{nameOf(r)}</p>
                  {answers > 0 && <p className="text-[13px] text-muted-foreground">{answersLine(answers, senders)}</p>}
                  <p className="text-[13px] text-muted-foreground">
                    {limit ?? sentence(r.reason)}
                    {notInGmail(data, r.action) && ". I don't do this in Gmail, so it stays yours to do"}
                  </p>
                </div>
                <StatusWords level={r.level} className="shrink-0">
                  {startWords(r.level, r.action)}
                </StatusWords>
              </li>
            );
          })}
        </ul>
      )}

      {stopped.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-3.5">
          <p className="text-[13px]">
            <span className="font-semibold">Always comes to you, whatever I learn: </span>
            {stopped.map((r) => `${nameOf(r).toLowerCase()} (${r.reason})`).join(", ")}.
          </p>
          <Link href="/promises" className="flex min-h-11 items-center gap-1 self-start text-[13px] font-semibold hover:underline">
            See every promise I keep
            <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}
