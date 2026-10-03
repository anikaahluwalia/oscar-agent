"use client";

import { RefreshCwIcon } from "lucide-react";
import { OscarMood } from "@/components/oscar-mood";
import { Loading, Page } from "@/components/page";
import { ReviewStats } from "@/components/review/review-stats";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/counts";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { setHash } from "@/lib/use-hash";
import { isReadOnly, useOscar, type OscarData } from "@/lib/use-oscar";

/** How often Oscar looks at your Gmail by himself, from Settings. */
function checksText(data: OscarData) {
  const m = data.gmail.auto_check_minutes;
  return m ? `I check your inbox every ${plural(m, "minute", "minutes")} on my own.` : "I check your inbox when you ask me to.";
}

const checkedText = (total: number) =>
  total === 1 ? "You've checked my one call." : `You've checked all ${total.toLocaleString()} of my calls.`;

const answeredText = (total: number) =>
  !total
    ? "Nothing I've asked about or stopped is waiting on you."
    : total === 1
      ? "You've answered the one email I asked about."
      : `You've answered all ${total.toLocaleString()} emails I asked about or stopped.`;

/** Oscar asleep, with a big line and what to do next. Only when nothing is waiting on you. */
function Resting({ title, text, children }: { title: string; text: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl border bg-card px-6 py-10 text-center shadow-card sm:py-12">
      <OscarMood pose="sleeping" size={120} />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">{title}</h1>
        <p className="max-w-md text-muted-foreground">{text}</p>
      </div>
      {children && <div className="flex flex-wrap justify-center gap-2.5">{children}</div>}
    </section>
  );
}

/**
 * Review: Oscar's calls, one at a time. On your real inbox you tell him whether he got each one
 * right, which grades him and teaches him. On the demo inbox you answer what he asked about or
 * stopped. "See all" keeps every email and the tabs within reach.
 */
export function ReviewPage() {
  const { data, error, feedback } = useOscar();
  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const real = data.gmail.connected;
  const readOnly = isReadOnly(data);
  // Your Gmail once it's connected; until then, the demo inbox.
  const items = data.items.filter((i) => i.decision.source === (real ? "gmail" : "demo"));
  const stats = <ReviewStats data={data} items={items} />;

  return (
    <Page className="max-w-[744px] gap-6 sm:pt-9">
      {items.length ? (
        <ReviewWorkspace
          items={items}
          real={real}
          readOnly={readOnly}
          canAct={real && data.gmail.acting}
          feedback={feedback}
          stats={stats}
          done={(total) => (
            <>
              <Resting
                title="All caught up!"
                text={real ? `${checkedText(total)} ${checksText(data)}` : answeredText(total)}
              >
                <Button variant="outline" className="h-11 bg-card px-5" onClick={() => setHash("all")}>
                  See all emails
                </Button>
                {real && !data.gmail.auto_check_minutes && (
                  <Button className="h-11 px-5" onClick={checkGmail}>
                    <RefreshCwIcon /> Check now
                  </Button>
                )}
              </Resting>
              <div className="flex justify-center">{stats}</div>
            </>
          )}
        />
      ) : real ? (
        <Resting title="Nothing read yet." text={checksText(data)}>
          {!data.gmail.auto_check_minutes && (
            <Button className="h-11 px-5" onClick={checkGmail}>
              Check now
            </Button>
          )}
        </Resting>
      ) : (
        <Resting title="No emails yet." text="Bring in the demo emails to see what I do with them, and teach me what you'd do.">
          <Button className="h-11 px-5" onClick={bringInDemo}>
            Bring in the demo emails
          </Button>
        </Resting>
      )}
    </Page>
  );
}
