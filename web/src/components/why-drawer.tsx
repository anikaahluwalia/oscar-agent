"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldIcon } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { isRule, ruleLine } from "@/components/inbox/decision-facts";
import { becauseOf } from "@/components/inbox/outcome";
import { Checklist } from "@/components/kit/checklist";
import { StatusPill } from "@/components/status-pill";
import type { Action } from "@/lib/api";
import { onOpenWhy } from "@/lib/drawers";
import { safetyChecks } from "@/lib/insights";
import { shownLevel, wouldOnly } from "@/lib/labels";
import { useOscar } from "@/lib/use-oscar";

// Actions whose effect reaches past your inbox: someone else sees it, or it can't be taken back there.
const EXTERNAL = new Set<Action>(["SEND_REPLY", "FORWARD", "UNSUBSCRIBE", "ACCEPT_MEETING", "SEND_CREDENTIALS", "MOVE_MONEY"]);

/**
 * "Why Oscar did this", in plain words: his reason, the rule or pattern he followed if there was one,
 * the safety checks, and what mattered. Never the model's reasoning or his working notes.
 */
export function WhyDrawer() {
  const { data } = useOscar();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => onOpenWhy(setId), []);
  const close = useCallback(() => setId(null), []);

  const decision = data?.items.find((i) => i.decision.id === id)?.decision;
  const would = !!decision && wouldOnly(decision);
  const rule = decision ? ruleLine(decision) : null;
  const checks = decision
    ? [{ label: "No effect outside your inbox", ok: !EXTERNAL.has(decision.action) }, ...safetyChecks(decision)]
    : [];

  return (
    <Drawer open={!!decision} onClose={close} title={would ? "Why Oscar would do this" : "Why Oscar did this"}>
      {decision && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{decision.sender}</p>
            <p className="font-medium">{decision.subject}</p>
            <StatusPill level={shownLevel(decision)} readOnly={decision.source === "gmail"} className="mt-1 self-start" />
          </div>

          <section className="flex flex-col gap-1.5">
            <p className="text-[15px]">{becauseOf(decision)}</p>
            {rule && (
              <p className="text-sm text-muted-foreground">
                {isRule(decision) ? "Your rule" : "What I've learned"}: {rule}.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldIcon className="size-4 text-muted-foreground" aria-hidden /> Safety
            </h3>
            <Checklist items={checks} />
          </section>

          {!!decision.factors?.length && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">What mattered</h3>
              <ul aria-label="What mattered" className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {decision.factors.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            These are the rules and feedback behind the decision. Protected rules can&apos;t be changed by feedback.
          </p>
        </div>
      )}
    </Drawer>
  );
}
