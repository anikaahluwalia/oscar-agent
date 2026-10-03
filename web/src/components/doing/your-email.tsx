import Link from "next/link";
import { Box } from "@/components/doing/headline";
import { Panel } from "@/components/kit/panel";
import type { DecisionWithFeedback, ReviewSummary } from "@/lib/api";

const pct = (r: number) => `${Math.round(r * 100)}%`;
const link = "font-medium text-foreground underline underline-offset-4 hover:no-underline";

/**
 * His earlier calls against his latest ones, by when he made them: is he getting better on your email?
 * Only the calls you've checked count. Null when there are too few to split.
 */
export function rightOverTime(items: DecisionWithFeedback[]) {
  const checked = items
    .filter((i) => i.decision.source === "gmail" && i.answer)
    .sort((a, b) => a.decision.created_at.localeCompare(b.decision.created_at));
  if (checked.length < 10) return null;
  const half = Math.floor(checked.length / 2);
  const right = (part: DecisionWithFeedback[]) => part.filter((i) => i.answer?.error === "none").length / part.length;
  const [first, latest] = [checked.slice(0, half), checked.slice(half)];
  return { first: { n: first.length, rate: right(first) }, latest: { n: latest.length, rate: right(latest) } };
}

function Trend({ items }: { items: DecisionWithFeedback[] }) {
  const t = rightOverTime(items);
  if (!t) return null;
  const [a, b] = [Math.round(t.first.rate * 100), Math.round(t.latest.rate * 100)];
  const title = b > a ? "I'm getting better on your email" : b < a ? "I've slipped on your email lately" : "About the same as when I started";
  const bar = (label: string, n: number, rate: number) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">
          {pct(rate)} <span className="font-normal text-muted-foreground">of {n}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(2, rate * 100)}%` }} />
      </div>
    </div>
  );
  return (
    <Panel title={title}>
      <div className="flex flex-col gap-3">
        {bar("My earlier calls", t.first.n, t.first.rate)}
        {bar("My latest calls", t.latest.n, t.latest.rate)}
      </div>
      <p className="text-[13px] text-muted-foreground">Right calls among the ones you&apos;ve checked, oldest half against newest half.</p>
    </Panel>
  );
}

/** How Oscar is doing on your real Gmail, from the calls you've checked in Review. */
export function YourEmail({ reviews, items, connected }: { reviews: ReviewSummary; items: DecisionWithFeedback[]; connected: boolean }) {
  const g = reviews.graded;
  if (!connected) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          Connect Gmail in{" "}
          <Link href="/settings" className={link}>
            Settings
          </Link>{" "}
          and check a few of my calls, and this page will show how I do on your email. Until then there are only the test results below.
        </p>
      </Panel>
    );
  }
  if ("held_back" in g) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          Some of your older reviews are only half answered, so I&apos;m holding these numbers back until you finish them on{" "}
          <Link href="/review" className={link}>
            Review
          </Link>
          .
        </p>
      </Panel>
    );
  }
  if (!("passed" in g) || g.n === 0) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          You haven&apos;t checked any of my calls yet. Answer a few on{" "}
          <Link href="/review" className={link}>
            Review
          </Link>{" "}
          and you&apos;ll see how I&apos;m doing on your email here.
        </p>
      </Panel>
    );
  }
  const stopped = g.acted_when_you_would_stop;
  return (
    <>
      <section aria-label="How often I got it right on your email" className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="text-6xl leading-none font-extrabold tracking-[-0.05em] tabular-nums sm:text-7xl">{pct(g.passed / g.n)}</span>
        <span className="max-w-[400px] text-lg text-foreground/80">
          of my calls on your email were right, out of {g.n.toLocaleString()} you&apos;ve checked.
        </span>
      </section>

      <ul aria-label="Where I went wrong" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Box value={stopped} bad={stopped > 0} label="times I acted when you'd have stopped me" note="This should always be 0." />
        <Box value={g.errors.too_cautious} label="times I was too careful" note="I'd have asked or held back when you'd have let me do it." />
        <Box value={g.errors.too_permissive} bad={g.errors.too_permissive > 0} label="times I'd have done too much" note="I'd have gone ahead when you wanted to see it." />
      </ul>

      <Trend items={items} />
    </>
  );
}
