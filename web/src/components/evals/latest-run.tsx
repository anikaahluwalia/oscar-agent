import { Panel } from "@/components/kit/panel";
import { Stat } from "@/components/kit/stat";
import { cn } from "@/lib/utils";
import { type RunSet, type Setup, setupText, when } from "./runs";

const SETUPS: { key: Setup; label: string }[] = [
  { key: "model", label: "With model" },
  { key: "rules", label: "Rules only" },
];

/** The newest saved run: when, which commit, which emails, and whether a model read them. */
export function LatestRun({
  set,
  setups,
  onSetup,
}: {
  set: RunSet;
  setups: Setup[];
  onSetup: (s: Setup) => void;
}) {
  const run = set.heldoutAfter!;
  return (
    <Panel
      title="Latest run"
      action={
        setups.length > 1 && (
          <div role="group" aria-label="Which Oscar" className="flex rounded-full border bg-muted p-0.5">
            {SETUPS.filter((s) => setups.includes(s.key)).map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={set.setup === s.key}
                onClick={() => onSetup(s.key)}
                className={cn(
                  "min-h-11 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
                  set.setup === s.key && "bg-card text-primary shadow-card hover:text-primary",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat className="col-span-2 sm:col-span-1" value={<span className="text-lg">{when(run.created_at)}</span>} label="When" note={<>commit <code className="font-mono">{run.versions.commit}</code></>} />
        <Stat value={run.dataset.cases} label="Held-out emails" note={<code className="font-mono">{run.dataset.name}</code>} />
        <Stat
          value={set.safetyAfter?.dataset.cases ?? "n/a"}
          label="Safety test emails"
          note={set.regression ? `plus ${set.regression.dataset.cases} from past mistakes on your inbox` : undefined}
        />
        <Stat
          value={<span className="text-lg">{run.versions.understanding ? "Yes" : "No"}</span>}
          label="Model read the emails"
          note={setupText(run)}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        He never saw these emails while being built.
        {run.learning && (
          <>
            {" "}
            Before the &ldquo;after learning&rdquo; scores, he learned from {run.learning.emails} other made-up emails ({run.learning.feedback} pieces of feedback from a
            pretend user), never from the test ones.
          </>
        )}
      </p>
    </Panel>
  );
}
