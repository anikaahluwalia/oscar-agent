"use client";

import { useEffect, useState } from "react";
import {
  BanknoteIcon,
  BellIcon,
  BotIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChevronDownIcon,
  InfoIcon,
  KeyRoundIcon,
  MailIcon,
  MessageCircleQuestionIcon,
  NewspaperIcon,
  ReceiptIcon,
  ShieldAlertIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayName } from "@/components/kit/sender";
import { getEmailTypes, sendClassification, type DecisionWithFeedback } from "@/lib/api";
import { typeName, typeOf } from "@/lib/labels";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  marketing: TagIcon,
  promotion: TagIcon,
  newsletter: NewspaperIcon,
  job_alert: BriefcaseIcon,
  social_notification: UsersIcon,
  receipt: ReceiptIcon,
  account_update: BellIcon,
  fyi: InfoIcon,
  question: MessageCircleQuestionIcon,
  personal: UserIcon,
  meeting_invite: CalendarIcon,
  security_alert: ShieldAlertIcon,
  money_request: BanknoteIcon,
  credential_request: KeyRoundIcon,
  instructions_for_ai: BotIcon,
  prompt_injection: BotIcon,
};

type Option = { type: string; risky: boolean };
// The kinds come from the API once (they're Oscar's own lists), and are shared by every pill.
let kinds: Promise<Option[]> | null = null;

/** Every kind of email you can pick, from the API (Oscar's own lists), fetched once and shared. */
export function useEmailTypes() {
  const [options, setOptions] = useState<Option[] | null>(null);
  useEffect(() => {
    let live = true;
    kinds ??= getEmailTypes().catch((e) => {
      kinds = null; // try again next time
      throw e;
    });
    kinds.then((o) => live && setOptions(o), () => {});
    return () => {
      live = false;
    };
  }, []);
  return options;
}

/**
 * What kind of email Oscar took this for, as a pill you can change. Changing it is classification
 * feedback: it teaches him how to read this sender's emails, and nothing about how much to involve
 * you or what's safe (oscar/classification.py).
 */
export function TypePill({ item, className }: { item: DecisionWithFeedback; className?: string }) {
  const options = useEmailTypes();
  const [busy, setBusy] = useState(false);
  const current = typeOf(item);
  const corrected = !!item.classification;
  const Icon = ICONS[current] ?? MailIcon;

  async function pick(type: string) {
    if (busy || type === current) return;
    setBusy(true);
    try {
      await sendClassification(item.decision.id, type);
      const risky = options?.find((o) => o.type === type)?.risky;
      oscarSays(
        type === "other" || risky
          ? "Thanks, I've noted that. It doesn't change what I'm allowed to do."
          : `Got it! I'll read emails from ${displayName(item.decision.sender)} as ${typeName(type).toLowerCase()} from now on.`,
      );
      notifyChanged();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const everyday = options?.filter((o) => !o.risky && o.type !== "other") ?? [];
  const risky = options?.filter((o) => o.risky) ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={`Kind of email: ${typeName(current)}${corrected ? ", as you said" : ""}. Change it`}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border bg-card px-3.5 text-[13px] font-semibold transition-colors hover:bg-surface-hover disabled:opacity-60",
            className,
          )}
        >
          <Icon className="size-4 text-muted-foreground" strokeWidth={1.9} aria-hidden />
          {typeName(current)}
          {corrected && <span className="size-1.5 rounded-full bg-level-notify" aria-hidden title="You said so" />}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(28rem,var(--radix-dropdown-menu-content-available-height))] w-72 overflow-y-auto">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="font-semibold">What kind of email is this?</span>
          <span className="text-xs text-muted-foreground">
            {corrected ? `I read it as ${typeName(item.classification!.original_type).toLowerCase()}. ` : ""}
            This teaches me how to read this sender&apos;s emails. It doesn&apos;t change what I&apos;m allowed to do.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!options ? (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Getting the kinds of email...</DropdownMenuLabel>
        ) : (
          <DropdownMenuRadioGroup value={current} onValueChange={(v) => void pick(v)}>
            {everyday.map((o) => (
              <DropdownMenuRadioItem key={o.type} value={o.type}>
                {typeName(o.type)}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">Risky kinds · always handled with care</DropdownMenuLabel>
            {risky.map((o) => (
              <DropdownMenuRadioItem key={o.type} value={o.type}>
                {typeName(o.type)}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuRadioItem value="other">Something else</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
