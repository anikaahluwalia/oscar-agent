"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GUIDE_KEY } from "@/components/demo/demo-guide";
import { Button } from "@/components/ui/button";
import { leaveDemo } from "@/lib/api";
import { checkGmail, resetDemoInbox } from "@/lib/demo";
import { useLocalSetting } from "@/lib/local-setting";
import { useDemoSession, useOscar } from "@/lib/use-oscar";

/**
 * A calm line across the top while you're in the demo: what it is, checking for new email (so the
 * later emails can come in without the guide), starting it again, and leaving. Starting again only
 * asks first once you've answered something, since that's what it forgets.
 */
export function DemoBanner() {
  const session = useDemoSession();
  const { data } = useOscar();
  const [, setGuide] = useLocalSetting<string>(GUIDE_KEY, "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!session) return null;

  const answered = !!data?.all.some((i) => i.feedback.length || i.review || i.safety_review || i.classification);

  async function reset() {
    setBusy(true);
    setConfirming(false);
    // The guide starts over too: it asks again if you'd like to see how he learns.
    if (await resetDemoInbox()) setGuide("");
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
              <b className="font-semibold text-foreground">Demo mode</b> · A simulated inbox, with Oscar&apos;s real learning and safety.
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
              <Button size="sm" variant="ghost" className="h-9 px-3 font-semibold sm:h-8" disabled={busy} onClick={() => void checkGmail()}>
                Check now
              </Button>
              <Button
                size="sm"
                variant="outline"
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
