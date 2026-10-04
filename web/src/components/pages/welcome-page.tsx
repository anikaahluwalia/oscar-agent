"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { OscarMood } from "@/components/oscar-mood";
import { Button } from "@/components/ui/button";
import { chooseGmail, enterDemo, getRealGmailStatus, gmailConnectUrl, leaveDemo, type GmailStatus } from "@/lib/api";
import { startDemo } from "@/lib/demo";
import { useLocalSetting } from "@/lib/local-setting";
import { oscarSays } from "@/lib/use-oscar";

const BIG = "h-12 rounded-full px-6 text-[15px] font-semibold sm:min-w-44";
const noSubscribe = () => () => {};

/**
 * The front page: who Oscar is, and two ways in. Connect Gmail for your own inbox, or try him on a
 * simulated one first (demo mode, just for this browser). Once you've picked Gmail and it's
 * connected, this page takes you straight to Today.
 */
export function WelcomePage() {
  const router = useRouter();
  const [mode] = useLocalSetting<string>("mode", "");
  // Which inbox you picked is only known in the browser, so nothing until then.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  // undefined while asking the API, null if it can't be reached.
  const [gmail, setGmail] = useState<GmailStatus | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Your real connection, even if you've come back here from the demo.
    getRealGmailStatus().then(setGmail, () => setGmail(null));
  }, []);

  const straightIn = mode === "gmail" && !!gmail?.connected;
  useEffect(() => {
    if (straightIn) router.replace("/today");
  }, [straightIn, router]);

  // Nothing to show for a moment, rather than a page that flashes past on the way to Today.
  if (!inBrowser || straightIn || (mode === "gmail" && gmail === undefined)) return null;

  async function tryOscar() {
    setStarting(true);
    enterDemo();
    try {
      await startDemo();
      router.push("/today");
    } catch (e) {
      leaveDemo();
      setStarting(false);
      oscarSays(e instanceof Error ? e.message : "I can't reach my API right now.");
    }
  }

  const canConnect = !!gmail?.configured;
  const note =
    gmail === null
      ? "I can't reach my API right now."
      : gmail && !gmail.configured && !gmail.only_demo
        ? "Connecting Gmail isn't set up on this server yet."
        : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[30rem] flex-col items-center gap-8 text-center animate-in fade-in-0">
        {/* He's asking: your inbox, or a try first? */}
        <OscarMood pose="asking" size={160} className="size-32 sm:size-40" />

        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[44px] leading-none font-extrabold tracking-[-0.04em] sm:text-[56px]">Oscar</h1>
          <p className="text-xl leading-snug font-bold tracking-[-0.02em] text-balance sm:text-[22px]">Your email, handled the way you would.</p>
          <p className="max-w-[26rem] text-[15px] leading-normal text-balance text-muted-foreground sm:text-base">
            He learns what to take care of, when to check with you, and what he never does on his own.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
          {gmail?.only_demo ? null : gmail?.connected ? (
            // Already connected on this computer: no need to go through Google again.
            <Button
              variant="outline"
              className={BIG}
              onClick={() => {
                chooseGmail();
                router.push("/today");
              }}
            >
              Open your inbox
            </Button>
          ) : canConnect ? (
            <Button asChild variant="outline" className={BIG}>
              <a href={gmailConnectUrl} onClick={chooseGmail}>
                Connect Gmail
              </a>
            </Button>
          ) : (
            <Button variant="outline" className={BIG} disabled>
              Connect Gmail
            </Button>
          )}
          <Button className={BIG} disabled={starting} onClick={() => void tryOscar()}>
            {starting ? "Getting ready..." : "Try Oscar"}
            {!starting && <ArrowRightIcon aria-hidden />}
          </Button>
        </div>

        <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
          <p>No Gmail needed for the demo.</p>
          {note && <p>{note}</p>}
        </div>
      </div>
    </main>
  );
}
