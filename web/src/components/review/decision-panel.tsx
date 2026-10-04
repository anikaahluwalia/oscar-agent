"use client";

import {
  ArrowRightIcon,
  ArchiveIcon,
  CheckIcon,
  CircleDotIcon,
  MailIcon,
  MailOpenIcon,
  MessageCircleIcon,
  ReplyIcon,
  ShieldIcon,
  TagIcon,
  UserIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { TypePill } from "@/components/classify/type-pill";
import { DraftBox } from "@/components/kit/draft-box";
import { describeAnswer } from "@/components/review/answer";
import { becauseOf, callLine, lower } from "@/components/review/call";
import { DecisionControls } from "@/components/review/decision-controls";
import { YouSaid } from "@/components/review/grade";
import { offersLikeThis } from "@/components/kit/like-this";
import { Button } from "@/components/ui/button";
import type { Action, DecisionWithFeedback, FeedbackKind, Level, Review } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { safetyChecks } from "@/lib/insights";
import { didIt } from "@/components/inbox/outcome";
import { DOABLE, isOldWay, yesOrNo } from "@/lib/labels";
import { isAnswered, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Feedback = ReturnType<typeof useOscar>["feedback"];

const ACTION_ICONS: Partial<Record<Action, LucideIcon>> = {
  ARCHIVE: ArchiveIcon,
  MARK_READ: MailOpenIcon,
  APPLY_LABEL: TagIcon,
  DRAFT_REPLY: ReplyIcon,
  SEND_REPLY: ReplyIcon,
};

/** A section of the panel: a heading, an optional line under it, then what's in it. */
export function PanelSection({
  title,
  text,
  children,
  className,
  tour,
}: {
  title: string;
  text?: string;
  children: React.ReactNode;
  className?: string;
  /** Its data-tour name, for the demo tour to point at. */
  tour?: string;
}) {
  return (
    <section data-tour={tour} className={cn("flex flex-col gap-3 border-t pt-5", className)}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
        {text && <p className="text-sm text-muted-foreground">{text}</p>}
      </div>
      {children}
    </section>
  );
}

/** One of the two big answers to "Was the action right?". */
function Answer({
  good,
  selected,
  title,
  text,
  keyName,
  disabled,
  onClick,
}: {
  good: boolean;
  selected: boolean;
  title: string;
  text: string;
  keyName: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = good ? CheckIcon : XIcon;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // Side by side when there's room for both, one above the other on a phone.
        "flex min-h-[76px] min-w-[11rem] flex-1 basis-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors disabled:opacity-60",
        good
          ? "border-status-handled/30 bg-status-handled/5 hover:bg-status-handled/10"
          : "border-status-blocked/30 bg-status-blocked/5 hover:bg-status-blocked/10",
        selected && (good ? "border-status-handled bg-status-handled/15" : "border-status-blocked bg-status-blocked/15"),
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          good ? "bg-status-handled/15 text-status-handled" : "bg-status-blocked/15 text-status-blocked",
        )}
      >
        <Icon className="size-5" strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          {title}
          <kbd className="hidden rounded-md border bg-card px-1.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline">{keyName}</kbd>
        </span>
        <span className="text-[13px] leading-snug text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

/** The three answers to "How much should I involve you next time?", each in its level's colour. */
const INVOLVE: { kind: FeedbackKind; level: Level; icon: LucideIcon; title: string; text: string }[] = [
  { kind: "JUST_HANDLE_IT", level: "PROCEED_SILENTLY", icon: ZapIcon, title: "Just handle it", text: "Similar emails can be handled without asking." },
  { kind: "HANDLE_AND_TELL_ME", level: "PROCEED_AND_NOTIFY", icon: MessageCircleIcon, title: "Handle + tell me", text: "Do it, but always let me know." },
  { kind: "KEEP_ASKING", level: "ASK_FIRST", icon: UserIcon, title: "Ask me", text: "Always check with me before doing this." },
];

const TINT: Record<Level, { on: string; icon: string }> = {
  PROCEED_SILENTLY: { on: "border-level-silent bg-level-silent/10", icon: "bg-level-silent/15 text-status-handled" },
  PROCEED_AND_NOTIFY: { on: "border-level-notify bg-level-notify/10", icon: "bg-level-notify/15 text-status-fyi" },
  ASK_FIRST: { on: "border-level-ask bg-level-ask/10", icon: "bg-level-ask/15 text-status-needs" },
  ESCALATE: { on: "border-level-escalate bg-level-escalate/10", icon: "bg-level-escalate/15 text-status-blocked" },
};

/** What you last told him about this sender and action: one of the three, or nothing yet. */
function chosenFor(data: ReturnType<typeof useOscar>["data"], item: DecisionWithFeedback): FeedbackKind | null {
  const row = data?.learned.find((r) => r.sender === item.decision.sender && r.action === item.decision.action);
  if (!row) return null;
  if (row.always_ask) return "KEEP_ASKING";
  if (row.told === "PROCEED_SILENTLY") return "JUST_HANDLE_IT";
  if (row.told === "PROCEED_AND_NOTIFY") return "HANDLE_AND_TELL_ME";
  return null;
}

function Involve({ item, busy, onChoose }: { item: DecisionWithFeedback; busy: boolean; onChoose: (kind: FeedbackKind) => void }) {
  const { data } = useOscar();
  const chosen = chosenFor(data, item);
  return (
    <div role="group" aria-label="How much should I involve you next time" className="flex flex-col gap-2">
      {INVOLVE.map((o) => {
        const on = chosen === o.kind;
        return (
          <button
            key={o.kind}
            type="button"
            aria-pressed={on}
            disabled={busy}
            onClick={() => onChoose(o.kind)}
            className={cn(
              "flex min-h-16 items-center gap-3.5 rounded-2xl border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:opacity-60",
              on && `border-2 ${TINT[o.level].on} hover:bg-transparent`,
            )}
          >
            <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-muted", on && TINT[o.level].icon)}>
              <o.icon className="size-[18px]" strokeWidth={1.9} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold">{o.title}</span>
              <span className="text-[13px] text-muted-foreground">{o.text}</span>
            </span>
            {on && <span className="ml-auto shrink-0 text-xs font-semibold text-muted-foreground">Current</span>}
          </button>
        );
      })}
    </div>
  );
}

const factorIcon = (f: string): LucideIcon =>
  /^Safety rule|safety rules/i.test(f) ? ShieldIcon : /sender/i.test(f) ? MailIcon : /^Reads like|kind of email/i.test(f) ? TagIcon : /^You /i.test(f) ? UserIcon : CircleDotIcon;

/** Why he did it: the few facts that mattered (never his working-out), and his safety checks. */
export function WhyFactors({ item }: { item: DecisionWithFeedback }) {
  const d = item.decision;
  const found = safetyChecks(d).filter((c) => !c.ok).length;
  return (
    <div className="flex flex-col gap-3">
      {!!d.factors?.length && (
        <ul className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
          {d.factors.map((f) => {
            const Icon = factorIcon(f);
            return (
              <li key={f} className="flex items-start gap-3 text-sm">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.9} aria-hidden />
                {f}
              </li>
            );
          })}
          <li className="flex items-start gap-3 text-sm">
            <ShieldIcon className={cn("mt-0.5 size-4 shrink-0", found ? "text-status-blocked" : "text-muted-foreground")} strokeWidth={1.9} aria-hidden />
            {found ? `Safety checks: ${found} found` : "Safety checks: nothing risky found"}
          </li>
        </ul>
      )}
      <button type="button" onClick={() => openWhy(d.id)} className="min-h-11 self-start text-[13px] font-semibold underline-offset-4 hover:underline sm:min-h-8">
        See every detail
      </button>
    </div>
  );
}

/** "Was the action right?" for your real inbox, where a Yes or a No grades him. */
function Graded({
  item,
  busy,
  asking,
  last,
  approves,
  onYes,
  onNo,
  onSkip,
  onSameAsLast,
  onChange,
}: {
  item: DecisionWithFeedback;
  busy: boolean;
  asking: boolean;
  last: Review | null;
  approves: boolean;
  onYes: () => void;
  onNo: () => void;
  onSkip: () => void;
  onSameAsLast: () => void;
  onChange: () => void;
}) {
  const review = item.review;
  const said = asking || !review || isOldWay(review) ? null : review.label === "CORRECT" ? "yes" : review.label === "SKIP" ? null : "no";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        <Answer good selected={said === "yes"} title="Yes" text="This was the right call" keyName="Y" disabled={busy} onClick={onYes} />
        <Answer good={false} selected={said === "no"} title="No" text="This should have been different" keyName="N" disabled={busy} onClick={onNo} />
      </div>
      {asking && approves && (
        <p className="text-[13px] text-muted-foreground">
          {item.decision.source === "gmail" ? "Yes also approves it, so I'll do it in Gmail now. You can undo it after." : "Yes also approves it, here in the demo inbox."}
        </p>
      )}
      {asking && (
        <div className="flex flex-wrap items-center gap-x-4 text-[13px] text-muted-foreground">
          <button type="button" disabled={busy} onClick={onSkip} className="min-h-11 hover:text-foreground sm:min-h-8">
            Not sure, skip it
          </button>
          {last?.should_be_level && (
            <button type="button" disabled={busy} onClick={onSameAsLast} className="min-h-11 text-left underline underline-offset-4 hover:text-foreground sm:min-h-8">
              No, same as the last one: {describeAnswer(last.should_be_level, last.should_be_action, last.reasons).toLowerCase()}
            </button>
          )}
        </div>
      )}
      {!asking && review && <YouSaid item={item} onChange={onChange} />}
    </div>
  );
}

/**
 * The regular review panel: Oscar's action and how he read the email, then two separate answers.
 * "Was the action right?" (Yes / No) and "How much should I involve you next time?" never stand in
 * for each other: a Yes doesn't mean "stop asking", and picking how much to involve you doesn't say
 * the action was right. Changing the kind of email is a third, separate answer.
 */
export function DecisionPanel({
  item,
  real,
  canAct,
  feedback,
  busy,
  asking,
  last,
  onYes,
  onNo,
  onSkip,
  onSameAsLast,
  onChange,
  onInvolve,
  onAnswered,
  onNext,
  footer,
}: {
  item: DecisionWithFeedback;
  real: boolean;
  canAct: boolean;
  feedback: Feedback;
  busy: boolean;
  asking: boolean;
  last: Review | null;
  onYes: () => void;
  onNo: () => void;
  onSkip: () => void;
  onSameAsLast: () => void;
  onChange: () => void;
  onInvolve: (kind: FeedbackKind) => void;
  onAnswered: (kind: FeedbackKind) => void;
  /** On to the next email, once you've said whether the action was right. */
  onNext?: () => void;
  footer: React.ReactNode;
}) {
  const d = item.decision;
  const Icon = ACTION_ICONS[d.action] ?? MailIcon;
  const because = becauseOf(item);
  const gradeable = real && yesOrNo(d);
  // On the demo inbox a Yes approves what he can do there too (api.approve_from_review), in its pretend Gmail.
  const approves = gradeable && d.autonomy_level === "ASK_FIRST" && !item.done && (d.source === "gmail" ? canAct : DOABLE.has(d.action) && !isAnswered(item));
  // He already did it: in Gmail (real, or the demo's pretend one) and it hasn't been undone.
  const didAlready = d.source === "gmail" ? d.acting && !!item.done && !item.done.undone_at : didIt(d, item.done, item.feedback);

  return (
    <div className="flex flex-col gap-5">
      <section data-tour="review-call" className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">Oscar&apos;s action</h2>
        <div className="flex items-start gap-3.5">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="size-[22px]" strokeWidth={1.8} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[17px] leading-snug font-bold">{callLine(item)}</p>
            {because && <p className="text-[13px] text-muted-foreground">Because {lower(because)}</p>}
            {/* He already did it: one tap to say what you'd rather, which in Gmail also fixes the email. */}
            {gradeable && didAlready && (
              <button type="button" disabled={busy} onClick={onNo}
                className="mt-1 self-start text-[13px] font-semibold underline underline-offset-4 hover:no-underline disabled:opacity-60">
                Not what you wanted? Do something else
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/60 px-3.5 py-2.5">
          <span className="text-sm text-muted-foreground">I understood this as</span>
          <TypePill item={item} />
        </div>
      </section>

      {gradeable ? (
        <PanelSection title="Was the action right?" text="Did I make the right decision with this email?" tour="review-buttons">
          <Graded
            item={item}
            busy={busy}
            asking={asking}
            last={last}
            approves={approves}
            onYes={onYes}
            onNo={onNo}
            onSkip={onSkip}
            onSameAsLast={onSameAsLast}
            onChange={onChange}
          />
          {onNext && gradeable && !asking && item.review && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed px-4 py-3">
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                {offersLikeThis(d) ? "Pick how much to involve me below, or move on." : "Thanks! Ready for the next one?"}
              </p>
              <Button className="h-10 rounded-full px-5 font-semibold" disabled={busy} onClick={onNext}>
                Next email <ArrowRightIcon aria-hidden />
              </Button>
            </div>
          )}
          {/* Yes already approves an ask, so only Undo is left here, once it's done in Gmail. */}
          <DecisionControls item={item} canAct={canAct} feedback={feedback} onAnswered={onAnswered} undoOnly />
        </PanelSection>
      ) : (
        <PanelSection title="Was the action right?" text="Your answer teaches me about this sender." tour="review-buttons">
          <DecisionControls item={item} canAct={canAct} feedback={feedback} onAnswered={onAnswered} />
          {!item.feedback.length && d.autonomy_level !== "ASK_FIRST" && d.autonomy_level !== "ESCALATE" && d.autonomy_level !== "PROCEED_AND_NOTIFY" && (
            <p className="text-sm text-muted-foreground">Nothing here needs you.</p>
          )}
        </PanelSection>
      )}

      {/* Only where there's something to pick: archive, mark as read and label (offersLikeThis). A
          heading with nothing to answer under it looked like a question that got skipped. */}
      {offersLikeThis(d) && (
        <PanelSection title="How much should I involve you next time?" text="Choose how I should handle similar emails from this sender.">
          <Involve item={item} busy={busy} onChoose={onInvolve} />
        </PanelSection>
      )}


      <DraftBox item={item} />

      <PanelSection title="Why did I do this?" text="These facts mattered for my decision.">
        <WhyFactors item={item} />
      </PanelSection>

      {footer}
    </div>
  );
}
