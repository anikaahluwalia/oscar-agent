import { cn } from "@/lib/utils";

/** A big number with what it is, and optionally what it's out of. Every number shown must come from real data. */
export function Stat({
  value,
  label,
  note,
  icon,
  tone,
  className,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  note?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "handled" | "fyi" | "needs" | "blocked";
  className?: string;
}) {
  const tint = tone ? { handled: "text-status-handled", fyi: "text-status-fyi", needs: "text-status-needs", blocked: "text-status-blocked" }[tone] : "";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        {icon && <span className={cn("shrink-0", tint)}>{icon}</span>}
        <span className={cn("text-2xl font-bold tracking-tight tabular-nums", tint)}>{value}</span>
      </div>
      <span className="text-sm">{label}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
