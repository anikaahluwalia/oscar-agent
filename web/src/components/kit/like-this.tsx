import { Button } from "@/components/ui/button";
import type { Action, Decision, FeedbackKind, Level, RuleScope } from "@/lib/api";

/** The actions "for emails like this" is offered for: easy to undo, and they never leave the mailbox. */
const LIKE_THIS_ACTIONS = new Set<Action>(["ARCHIVE", "MARK_READ", "APPLY_LABEL"]);

export const offersLikeThis = (d: Decision) => LIKE_THIS_ACTIONS.has(d.action) && d.autonomy_level !== "ESCALATE";

export type LikeThisChoice = { kind: FeedbackKind; label: string; scope?: RuleScope; level?: Level };

export const LIKE_THIS: LikeThisChoice[] = [
  { kind: "JUST_HANDLE_IT", label: "Just handle them" },
  { kind: "HANDLE_AND_TELL_ME", label: "Handle + tell me" },
  { kind: "KEEP_ASKING", label: "Keep asking" },
  // Not just this sender: every email of this kind, from anyone. The same rule What Oscar knows sets.
  { kind: "ALWAYS_DO_THIS", label: "Handle all emails like this", scope: "kind", level: "PROCEED_SILENTLY" },
];

/**
 * How much Oscar should do on his own with emails like this one, asked in the Inbox. Approving only
 * says the action was right; this says how much he should ask. Review asks the same in its own panel.
 */
export function LikeThis({
  busy,
  onChoose,
  onSkip,
  big = false,
}: {
  busy: boolean;
  onChoose: (choice: LikeThisChoice) => void;
  onSkip?: () => void;
  big?: boolean;
}) {
  const size = big ? "h-12 flex-1 basis-0 rounded-full px-4 text-[15px] font-semibold sm:flex-none sm:basis-auto" : "h-10 rounded-full px-4";
  return (
    <div className="flex flex-col gap-2.5" role="group" aria-label="For emails like this">
      <p className="text-sm font-medium">For emails like this:</p>
      <div className="flex flex-wrap gap-2">
        {/* All the same, so none of them looks already picked. */}
        {LIKE_THIS.map((c) => (
          <Button
            key={c.kind}
            variant="outline"
            className={size}
            disabled={busy}
            data-tour={c.scope === "kind" ? "like-this-all" : undefined}
            onClick={() => onChoose(c)}
          >
            {c.label}
          </Button>
        ))}
      </div>
      {onSkip && (
        <button type="button" disabled={busy} onClick={onSkip} className="min-h-11 self-start text-sm text-muted-foreground hover:text-foreground">
          Skip, just this one
        </button>
      )}
    </div>
  );
}
