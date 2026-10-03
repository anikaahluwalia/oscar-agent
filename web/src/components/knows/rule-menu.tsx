"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sendFeedback, type Level } from "@/lib/api";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";

/** How much to involve you, in the words the Review page uses. */
export const INVOLVE_WORDS: Record<Level, string> = {
  PROCEED_SILENTLY: "Just handle it",
  PROCEED_AND_NOTIFY: "Handle + tell me",
  ASK_FIRST: "Ask me",
  ESCALATE: "Always comes to you",
};

const CHOICES: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST"];

/** Saves a rule for every email like this one: the same answers the Review page and chat give (oscar/feedback.py). */
async function setKindRule(decisionId: string, level: Level) {
  const { reply } =
    level === "ASK_FIRST"
      ? await sendFeedback(decisionId, "ALWAYS_ASK_ME", undefined, "kind")
      : await sendFeedback(decisionId, "ALWAYS_DO_THIS", undefined, "kind", level);
  oscarSays(reply);
  notifyChanged();
}

/** Forgets the rule for emails like this one. What you said about single senders stays. */
export async function forgetKindRule(decisionId: string) {
  const { reply } = await sendFeedback(decisionId, "FORGET", undefined, "kind");
  oscarSays(reply);
  notifyChanged();
}

/**
 * Pick how much to involve you with every email like this one. Used to change a rule, or to turn a
 * pattern into one. Safety checks still run after it, so nothing here can make a risky email quiet.
 */
export function RuleMenu({ decisionId, current, label, name }: { decisionId: string; current: Level | null; label: string; name: string }) {
  const [busy, setBusy] = useState(false);

  async function choose(level: Level) {
    if (busy || level === current) return;
    setBusy(true);
    try {
      await setKindRule(decisionId, level);
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 rounded-full px-3.5 text-[13px] font-semibold" disabled={busy} aria-label={`${label}: ${name}`}>
          {label}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="font-semibold">{name}</span>
          <span className="text-xs text-muted-foreground">How much should I involve you? Anything risky still comes to you.</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={current ?? ""} onValueChange={(v) => void choose(v as Level)}>
          {CHOICES.map((level) => (
            <DropdownMenuRadioItem key={level} value={level}>
              {INVOLVE_WORDS[level]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
