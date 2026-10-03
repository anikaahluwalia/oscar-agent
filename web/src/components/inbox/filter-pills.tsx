import { cn } from "@/lib/utils";

export type Pill<T extends string> = { key: T; label: string; count: number };

/** The Inbox's filters: round pills, the chosen one in charcoal, with how many each holds. */
export function FilterPills<T extends string>({ options, value, onChange }: { options: Pill<T>[]; value: T; onChange: (key: T) => void }) {
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[13px] font-semibold transition-colors hover:bg-surface-hover sm:min-h-9",
            value === o.key && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {o.label}
          <span className="tabular-nums opacity-70">{o.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}
