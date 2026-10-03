import { cn } from "@/lib/utils";

export type Chip<T extends string> = { key: T; label: string; count?: number };

/** Filter chips with counts, like "All 7 · Needs you 3". The selected one is blue. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Chip<T>[];
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex min-h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium hover:bg-surface-hover",
            value === o.key && "border-transparent bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular-nums opacity-70">{o.count.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}
