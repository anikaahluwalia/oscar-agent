import { RULE_LINE, type Protection } from "@/components/safety/protections";
import { cn } from "@/lib/utils";

/**
 * One protection learning can't change: an icon, what it covers, and the rule in red (comes to you)
 * or amber (asks first). `count` is how many of Oscar's real decisions it covered in the last 30 days.
 */
export function ProtectionCard({ protection: p, count }: { protection: Protection; count: number | null }) {
  const Icon = p.icon;
  const stop = p.kind === "stop";
  return (
    <li
      className={cn(
        "flex gap-3 rounded-2xl border bg-card p-4 shadow-card",
        stop ? "border-status-blocked/20" : "border-status-needs/20",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          stop ? "bg-status-blocked/10 text-status-blocked" : "bg-status-needs/10 text-status-needs",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-semibold leading-snug">{p.title}</h3>
        <p className="text-sm text-muted-foreground">{p.line}</p>
        <p className={cn("text-sm font-semibold", stop ? "text-status-blocked" : "text-status-needs")}>{RULE_LINE[p.kind]}</p>
        {count !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {count === 0
              ? "Hasn't come up in the last 30 days."
              : `Came up in ${count.toLocaleString()} ${count === 1 ? "email" : "emails"} in the last 30 days.`}
          </p>
        )}
      </div>
    </li>
  );
}
