import { LockIcon, ShieldIcon } from "lucide-react";
import type { ProtectedRule } from "@/lib/labels";

/** A rule learning can't change. No edit or forget, on purpose. */
export function ProtectedRuleCard({ rule }: { rule: ProtectedRule }) {
  const Icon = rule.kind === "never" ? ShieldIcon : LockIcon;
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-dashed p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{rule.title}</p>
        <p className="text-sm">{rule.rule}</p>
        <p className="text-sm text-muted-foreground">{rule.why}</p>
      </div>
      <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Protected</span>
    </li>
  );
}
