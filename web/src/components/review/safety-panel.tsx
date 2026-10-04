"use client";

import { useState } from "react";
import { CheckIcon, LockIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useEmailTypes } from "@/components/classify/type-pill";
import { PanelSection, WhyFactors } from "@/components/review/decision-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendSafetyReview, type Decision, type DecisionWithFeedback, type SafetyReview } from "@/lib/api";
import { FLAGS, typeName } from "@/lib/labels";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

// What each safety check found, as a headline, and the thing it protects. Keyed by the safety flags
// (SafetyCategory in oscar/models.py, set by the checks in oscar/safety.py).
const FOUND: Record<string, [string, string]> = {
  MONEY: ["Money movement detected", "Moving money is protected"],
  CREDENTIALS: ["Password or code request detected", "Sharing passwords and codes is protected"],
  PROMPT_INJECTION: ["Hidden instructions detected", "Following instructions in an email is protected"],
  ACCOUNT_SECURITY: ["Account security change detected", "Your account's security is protected"],
  SENSITIVE_DATA: ["Request for private information", "Handing over private info is protected"],
  COMMITMENT: ["A commitment in your name", "Agreeing to things for you is protected"],
  IRREVERSIBLE_DELETE: ["A request to delete email for good", "Deleting for good always needs your yes"],
};
// The same, when the floor for the action stopped it and no check on the email fired.
const BY_ACTION: Record<string, string> = { MOVE_MONEY: "MONEY", SEND_CREDENTIALS: "CREDENTIALS" };

function foundOf(d: Decision): { title: string; why: string[] } {
  const keys = d.safety_flags.length ? d.safety_flags : BY_ACTION[d.action] ? [BY_ACTION[d.action]] : [];
  const [first] = keys;
  const title = first ? FOUND[first]?.[0] ?? FLAGS[first] : "It looked risky when I read it closely";
  const why = [
    // The rule says it in full; the short name only when there's no rule to quote.
    ...(d.safety_rule ? [] : keys.map((k) => FLAGS[k]).filter(Boolean)),
    ...(d.safety_rule ? [`${d.safety_rule.charAt(0).toUpperCase()}${d.safety_rule.slice(1)}`] : []),
    ...keys.map((k) => FOUND[k]?.[1]).filter(Boolean),
    "This safety rule can't be learned away",
  ];
  return { title, why: [...new Set(why)] };
}

function Choice({ good, selected, title, disabled, onClick }: { good: boolean; selected: boolean; title: string; disabled: boolean; onClick: () => void }) {
  const Icon = good ? CheckIcon : XIcon;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-1 basis-0 items-center gap-3 rounded-2xl border bg-card px-3.5 py-2.5 text-left text-[15px] font-semibold hover:bg-surface-hover disabled:opacity-60",
        selected && (good ? "border-status-handled bg-status-handled/10" : "border-status-blocked bg-status-blocked/10"),
      )}
    >
      <span
        aria-hidden
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", good ? "bg-status-handled/15 text-status-handled" : "bg-status-blocked/15 text-status-blocked")}
      >
        <Icon className="size-[18px]" strokeWidth={2.2} />
      </span>
      {title}
    </button>
  );
}

function said(review: SafetyReview) {
  if (review.verdict === "RISK_CORRECT") return "Yes, this was risky";
  return `No, this was misclassified${review.corrected_type ? `: it's ${typeName(review.corrected_type).toLowerCase()}` : ""}`;
}

/**
 * Safety review: an email a safety rule stopped. The only question is whether Oscar read the risk
 * right. There's no "just handle it" here, and no answer can teach him that a risk is fine: a "No"
 * can only say what the email really is (oscar/safety_review.py).
 */
export function SafetyPanel({ item, onAnswered, footer }: { item: DecisionWithFeedback; onAnswered: () => void; footer: React.ReactNode }) {
  const d = item.decision;
  const { title, why } = foundOf(d);
  const kinds = useEmailTypes();
  const [changing, setChanging] = useState(false);
  const [misread, setMisread] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const answered = !!item.safety_review && !changing;

  async function send(verdict: SafetyReview["verdict"]) {
    if (busy) return;
    setBusy(true);
    try {
      await sendSafetyReview(d.id, verdict, verdict === "MISCLASSIFIED" ? type : null, verdict === "MISCLASSIFIED" ? note.trim() || null : null);
      oscarSays(
        verdict === "RISK_CORRECT"
          ? "Thanks! I'll keep stopping emails like this."
          : "Thanks, that helps me read emails like this. I'll still stop anything that really is risky.",
      );
      notifyChanged();
      setChanging(false);
      setMisread(false);
      onAnswered();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const everyday = kinds?.filter((k) => !k.risky && k.type !== "other") ?? [];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">I stopped here.</h2>
        <div className="flex items-start gap-3.5 rounded-2xl border border-status-blocked/30 bg-status-blocked/5 p-3.5">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-status-blocked/15 text-status-blocked">
            <ShieldAlertIcon className="size-[22px]" strokeWidth={1.8} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[17px] leading-snug font-bold">{title}</p>
            <p className="text-[13px] text-muted-foreground">No action was taken. It came straight to you.</p>
          </div>
        </div>
      </section>

      <PanelSection title="Why I stopped">
        <ul className="flex flex-col gap-2 text-sm">
          {why.map((w) => (
            <li key={w} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-status-blocked" />
              {w}
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection title="Did I identify the risk correctly?">
        {answered ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-2xl border border-dashed bg-card px-4 py-3 text-sm">
            <p>
              You said: <span className="font-semibold">{said(item.safety_review!)}</span>
            </p>
            <button type="button" onClick={() => setChanging(true)} className="min-h-11 font-semibold underline-offset-4 hover:underline">
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Choice good selected={false} title="Yes, this was risky" disabled={busy} onClick={() => void send("RISK_CORRECT")} />
              <Choice good={false} selected={misread} title="No, this was misclassified" disabled={busy} onClick={() => setMisread(true)} />
            </div>
            {misread && (
              <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                <p className="text-sm font-semibold">What is it really? (optional)</p>
                <div className="flex flex-wrap gap-1.5">
                  {everyday.map((k) => (
                    <button
                      key={k.type}
                      type="button"
                      aria-pressed={type === k.type}
                      onClick={() => setType(type === k.type ? null : k.type)}
                      className={cn(
                        "min-h-9 rounded-full border bg-card px-3 text-[13px] font-semibold hover:bg-surface-hover",
                        type === k.type && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                    >
                      {typeName(k.type)}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What did I get wrong? (optional)"
                  aria-label="What did I get wrong (optional)"
                  className="min-h-16 rounded-xl bg-card"
                />
                <div className="flex flex-wrap gap-2">
                  <Button className="h-10 rounded-full px-5 font-semibold" disabled={busy} onClick={() => void send("MISCLASSIFIED")}>
                    Save
                  </Button>
                  <Button variant="ghost" className="h-10 rounded-full px-4 text-muted-foreground" onClick={() => setMisread(false)}>
                    Back
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        <p className="flex items-start gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-[13px] leading-snug text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold text-foreground">Safety rules don&apos;t change from feedback.</span> Your correction helps me understand when the
            rule applies.
          </span>
        </p>
      </PanelSection>

      <PanelSection title="What I noticed">
        <WhyFactors item={item} />
      </PanelSection>

      {footer}
    </div>
  );
}
