import { cn } from "@/lib/utils";

export type Chip<T extends string> = { key: T; label: string; count: number; dot?: string };

/**
 * Filter chips with counts, like the kit's FilterChips but 44px tall on phones so they're
 * easy to tap, with each status's colour dot.
 */
export function ActivityChips<T extends string>({ options, value, onChange }: { options: Chip<T>[]; value: T; onChange: (key: T) => void }) {
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-surface-hover sm:min-h-9",
            value === o.key && "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {o.dot && <span aria-hidden className={cn("size-1.5 rounded-full", value === o.key ? "bg-current" : o.dot)} />}
          {o.label}
          <span className="tabular-nums opacity-75">{o.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}
