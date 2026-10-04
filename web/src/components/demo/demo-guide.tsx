"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRightIcon, XIcon } from "lucide-react";
import { InboxLink } from "@/components/inbox/inbox-link";
import { OscarMood, type OscarPose } from "@/components/oscar-mood";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback, FeedbackEvent } from "@/lib/api";
import { checkGmail, resetDemoInbox } from "@/lib/demo";
import { useLocalSetting } from "@/lib/local-setting";
import { useDemoSession, useOscar, type OscarData } from "@/lib/use-oscar";

/** Where the guide keeps its place in this browser: "<demo id>:<step>", so a new demo starts it over. */
export const GUIDE_KEY = "demo-guide";

// ask: would you like to see? teach: the sale email, then one from a different shop. last: the
// tricky one. off: closed, until the demo starts again.
const STEPS = ["ask", "teach", "last", "off"] as const;
type Step = (typeof STEPS)[number];

// The demo emails the guide points to. It only finds them to link to them: what Oscar does with
// each one is his own call, made the same way as on a real inbox.
const SALE = "demo-denim-sale";
const OTHER_SHOP = "demo-trailhead-sale";
const TRICKY = "demo-cedar-sale";

const TAP = "h-9 rounded-full px-4 text-[13px] font-semibold";

/** "Handle all emails like this": a rule about every email of this kind, from any sender. */
const isKindRule = (f: FeedbackEvent) => f.kind === "ALWAYS_DO_THIS" && f.scope === "kind" && !f.blocked_by_floor;
/** One of the other answers to "for emails like this", about this sender only. */
const isSenderAnswer = (f: FeedbackEvent) => f.kind === "JUST_HANDLE_IT" || f.kind === "HANDLE_AND_TELL_ME" || f.kind === "KEEP_ASKING";

/**
 * A small card in the corner that shows, in about a minute, how Oscar learns: you teach him about
 * one sale email, he handles a sale from a different shop on his own, and his safety rules still
 * stop a tricky one. Only in demo mode. It never covers the page, and it can be closed at any step.
 * Each step reads what really happened from the data, so if you looked around first it still
 * knows where you are, and offers a way forward when something isn't as expected.
 */
export function DemoGuide() {
  const session = useDemoSession();
  const { data } = useOscar();
  const [saved, setSaved] = useLocalSetting<string>(GUIDE_KEY, "");
  const path = usePathname();
  // Out of the way of the chat box; it's back on every other page. And not while the demo inbox is still starting.
  if (!session || !data?.all.length || path === "/chat") return null;

  const [id, place] = saved.split(":");
  const step: Step = id === session && STEPS.includes(place as Step) ? (place as Step) : "ask";
  const go = (next: Step) => setSaved(`${session}:${next}`);
  if (step === "off") return null;

  return <Guide step={step} data={data} go={go} />;
}

function Guide({ step, data, go }: { step: Step; data: OscarData; go: (next: Step) => void }) {
  const [busy, setBusy] = useState(false);
  const find = (emailId: string) => data.items.find((i) => i.decision.email_id === emailId);

  async function bringIn() {
    setBusy(true);
    await checkGmail();
    setBusy(false);
  }

  async function reset() {
    setBusy(true);
    if (await resetDemoInbox()) go("teach");
    setBusy(false);
  }

  const close = () => go("off");
  const resetButton = (
    <Button key="reset" variant="outline" className={TAP} disabled={busy} onClick={() => void reset()}>
      Reset demo
    </Button>
  );
  const openIt = (item: DecisionWithFeedback) => (
    <Button key="open" asChild variant="outline" className={TAP}>
      <InboxLink id={item.decision.id}>Open it</InboxLink>
    </Button>
  );

  if (step === "ask") {
    return (
      <Card pose="asking" onClose={close}>
        <Line>Want to see how I learn? It takes about a minute.</Line>
        <Actions>
          <Button className={TAP} onClick={() => go("teach")}>
            Show me
          </Button>
          <Button variant="ghost" className={TAP} onClick={close}>
            I&apos;ll look around
          </Button>
        </Actions>
      </Card>
    );
  }

  const sale = find(SALE);
  const rule = data.all.filter((i) => i.decision.email_id === SALE).flatMap((i) => i.feedback).find(isKindRule);
  const otherShop = find(OTHER_SHOP);

  if (step === "teach" && !sale) {
    return (
      <Card pose="thinking" onClose={close}>
        <Line>I can&apos;t find the sale email I wanted to show you. Starting the demo again brings it back.</Line>
        <Actions>{resetButton}</Actions>
      </Card>
    );
  }

  // 1. Teach him about one sale email.
  if (step === "teach" && sale && !rule) {
    const choseOther = sale.feedback.some(isSenderAnswer);
    return (
      <Card pose="asking" count={1} onClose={close}>
        {choseOther ? (
          <Line>
            You picked an answer about just this shop, which is fine. To see the rest, reset the demo and choose{" "}
            <b className="font-semibold">Handle all emails like this</b>.
          </Line>
        ) : (
          <Line>
            This sale email is new to me, so I&apos;m asking first. Approve it, then choose{" "}
            <b className="font-semibold">Handle all emails like this</b>.
          </Line>
        )}
        <Actions>{choseOther ? resetButton : openIt(sale)}</Actions>
      </Card>
    );
  }

  // 2. A sale from a different shop.
  if (step === "teach" && rule) {
    if (!otherShop) {
      return (
        <Card pose="learning" count={2} onClose={close}>
          <Line>Got it. Now a sale from a different shop.</Line>
          <Actions>
            <Button className={TAP} disabled={busy} onClick={() => void bringIn()}>
              Bring in new email
            </Button>
          </Actions>
        </Card>
      );
    }
    if (otherShop.decision.autonomy_level === "PROCEED_SILENTLY") {
      return (
        <Card pose="done" count={2} onClose={close}>
          <Line>✓ I handled it on my own: you taught me emails like this, from any shop.</Line>
          <Actions>
            {openIt(otherShop)}
            <Button className={TAP} onClick={() => go("last")}>
              Next
            </Button>
          </Actions>
        </Card>
      );
    }
    // It came in before the rule (you brought it in while looking around), or he still asked.
    const before = Date.parse(otherShop.decision.created_at) < Date.parse(rule.created_at);
    return (
      <Card pose="thinking" count={2} onClose={close}>
        <Line>
          {before
            ? "That one came in before you taught me, so I asked first. Reset the demo to see it fresh."
            : "I checked with you on this one. Open it to see why."}
        </Line>
        <Actions>
          {openIt(otherShop)}
          {before ? (
            resetButton
          ) : (
            <Button className={TAP} onClick={() => go("last")}>
              Next
            </Button>
          )}
        </Actions>
      </Card>
    );
  }

  // 3. A sale he still stops: the safety rules come before anything you teach him.
  const tricky = find(TRICKY);
  if (!tricky) {
    return (
      <Card pose="checking" count={3} onClose={close}>
        <Line>One more sale is on its way.</Line>
        <Actions>
          <Button className={TAP} disabled={busy} onClick={() => void bringIn()}>
            Bring in new email
          </Button>
        </Actions>
      </Card>
    );
  }
  const stopped = tricky.decision.autonomy_level === "ESCALATE";
  return (
    <Card pose={stopped ? "guarding" : "reporting"} count={3} onClose={close}>
      <Line>{stopped ? "✓ You said I could handle sales like this. My safety rules still stopped this one." : "Here's one more sale, from another shop."}</Line>
      <Actions>{openIt(tricky)}</Actions>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-sm font-semibold">That&apos;s the demo.</span>
        <Button className={TAP} onClick={close}>
          Explore Oscar <ArrowRightIcon aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

function Card({ pose, count, onClose, children }: { pose: OscarPose; count?: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      {/* Room at the end of the page, so the card never sits over the last of it. */}
      <div aria-hidden className="h-32 shrink-0 md:h-16" />
      <aside
        aria-label="Demo guide"
        className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex items-start gap-3 rounded-2xl border bg-card p-4 pr-10 shadow-card animate-in fade-in-0 slide-in-from-bottom-2 md:inset-x-auto md:bottom-6 md:left-[calc(232px+1.5rem)] md:w-[23rem]"
      >
        <OscarMood pose={pose} size={56} className="-my-1 size-12 md:size-14" />
        <div aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-3">
          {count !== undefined && <span className="text-xs font-semibold text-muted-foreground">{count} of 3</span>}
          {children}
        </div>
        <button
          type="button"
          aria-label="Close the guide"
          onClick={onClose}
          className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </aside>
    </>
  );
}

const Line = ({ children }: { children: React.ReactNode }) => <p className="text-sm leading-snug">{children}</p>;
const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;
