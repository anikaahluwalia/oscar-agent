import { Button } from "@/components/ui/button";
import type { Action, Decision, FeedbackKind } from "@/lib/api";

/** The actions "for emails like this" is offered for: easy to undo, and they never leave the mailbox. */
const LIKE_THIS_ACTIONS = new Set<Action>(["ARCHIVE", "MARK_READ", "APPLY_LABEL"]);

export const offersLikeThis = (d: Decision) => LIKE_THIS_ACTIONS.has(d.action) && d.autonomy_level !== "ESCALATE";

export const LIKE_THIS: { kind: FeedbackKind; label: string }[] = [
  { kind: "JUST_HANDLE_IT", label: "Just handle them" },
  { kind: "HANDLE_AND_TELL_ME", label: "Handle + tell me" },
  { kind: "KEEP_ASKING", label: "Keep asking" },
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
  onChoose: (kind: FeedbackKind) => void;
  onSkip?: () => void;
  big?: boolean;
}) {
  const size = big ? "h-12 flex-1 basis-0 rounded-full px-4 text-[15px] font-semibold sm:flex-none sm:basis-auto" : "h-10 rounded-full px-4";
  return (
    <div className="flex flex-col gap-2.5" role="group" aria-label="For emails like this">
      <p className="text-sm font-medium">For emails like this:</p>
      <div className="flex flex-wrap gap-2">
        {LIKE_THIS.map((c, i) => (
          <Button key={c.kind} variant={i === 0 ? "default" : "outline"} className={size} disabled={busy} onClick={() => onChoose(c.kind)}>
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
