import { LockIcon, ShieldIcon } from "lucide-react";
import type { ProtectedRule } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** A rule learning can't change. No edit or forget, on purpose. Red: comes to you. Amber: asks first. */
export function ProtectedRuleCard({ rule }: { rule: ProtectedRule }) {
  const never = rule.kind === "never";
  const Icon = never ? ShieldIcon : LockIcon;
  return (
    <li className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card">
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          never ? "bg-status-blocked/10 text-status-blocked" : "bg-status-needs/10 text-status-needs",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-semibold">{rule.title}</p>
        <p className={cn("text-sm font-medium", never ? "text-status-blocked" : "text-status-needs")}>{rule.rule}</p>
        <p className="text-sm text-muted-foreground">{rule.why}</p>
      </div>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Protected</span>
    </li>
  );
}
