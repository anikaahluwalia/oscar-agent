"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forgetTour, startTour } from "@/components/demo/tour";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { leaveDemo } from "@/lib/api";
import { checkGmail, resetDemoInbox } from "@/lib/demo";
import { forgetDemoName } from "@/lib/demo-name";
import { useDemoSession, useOscar } from "@/lib/use-oscar";

/**
 * A calm line across the top while you're in the demo: what it is, the tour, checking for new email
 * (so the later emails can come in without the tour), starting it again, and leaving. Starting again
 * only asks first once you've answered something, since that's what it forgets.
 */
export function DemoBanner() {
  const session = useDemoSession();
  const { data } = useOscar();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!session) return null;

  const answered = !!data?.all.some((i) => i.feedback.length || i.review || i.safety_review || i.classification);

  async function reset() {
    setBusy(true);
    setConfirming(false);
    // The tour starts over too: Oscar asks your name and offers to show you around again.
    if (await resetDemoInbox()) {
      forgetDemoName();
      forgetTour();
    }
    setBusy(false);
  }

  function leave() {
    leaveDemo();
    router.push("/");
  }

  return (
    <div role="region" aria-label="Demo mode" className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 text-[13px] sm:px-10">
        <p className="flex min-w-0 flex-1 basis-64 items-center gap-2 text-muted-foreground">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-level-notify" />
          {confirming ? (
            <span>Start the demo again? I&apos;ll forget what you taught me here.</span>
          ) : (
            <span>
              <b className="font-semibold text-foreground">Demo mode</b> · Simulated inbox, <RealLogic />.
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {confirming ? (
            <>
              <Button size="sm" className="h-9 px-3.5 font-semibold sm:h-8" disabled={busy} onClick={() => void reset()}>
                Yes, start again
              </Button>
              <Button size="sm" variant="ghost" className="h-9 px-3 sm:h-8" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-9 px-3 font-semibold sm:h-8" onClick={() => startTour(session)}>
                Tour
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-tour="check-now"
                className="h-9 px-3 font-semibold sm:h-8"
                disabled={busy}
                onClick={() => void checkGmail()}
              >
                Check now
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-tour="reset-demo"
                className="h-9 px-3.5 font-semibold sm:h-8"
                disabled={busy}
                onClick={() => (answered ? setConfirming(true) : void reset())}
              >
                Reset demo
              </Button>
              <Button size="sm" variant="ghost" className="h-9 px-3 text-muted-foreground sm:h-8" onClick={leave}>
                Leave
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * "real Oscar logic", with a short note on what that means. It opens on hover or focus, and on a
 * tap too, since a phone has no hover.
 */
function RealLogic() {
  const [open, setOpen] = useState(false);
  // A tap toggles it. The tooltip would otherwise close itself on the same tap (and a tap outside
  // it closes it first), so this goes by whether it was open when the tap started.
  const wasOpen = useRef(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => {
            wasOpen.current = open;
            e.preventDefault();
          }}
          onClick={(e) => {
            e.preventDefault();
            // From the keyboard (no tap), whether it's open now.
            setOpen(e.detail === 0 ? !open : !wasOpen.current);
          }}
          className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          real Oscar logic
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="z-[70] text-[13px] leading-snug">
        The emails are synthetic. Decisions still use Oscar&apos;s normal classification, preference-learning, and safety pipeline.
      </TooltipContent>
    </Tooltip>
  );
}
