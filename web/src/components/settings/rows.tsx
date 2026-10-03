import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A titled white card of settings rows, split by thin lines, like the mock-up. */
export function SettingsGroup({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {note && <span className="rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground">{note}</span>}
      </div>
      <div className="flex flex-col divide-y rounded-2xl border bg-card shadow-card">{children}</div>
    </section>
  );
}

/**
 * One setting: an icon, what it is, a short line about it, and its control on the right.
 * Anything longer (a list of facts, a choice of options) goes in `children`, under the text.
 */
export function SettingsRow({
  icon: Icon,
  title,
  text,
  control,
  children,
  tone = "primary",
  inline = false,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  text?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  tone?: "primary" | "handled" | "blocked" | "muted";
  /** Keep the control beside the text even on a phone (for small controls like a switch). */
  inline?: boolean;
}) {
  const tint = {
    primary: "bg-primary/10 text-primary",
    handled: "bg-status-handled/10 text-status-handled",
    blocked: "bg-status-blocked/10 text-status-blocked",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className="flex gap-3 p-4 sm:p-5">
      <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tint)}>
        <Icon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className={cn("flex items-center justify-between gap-x-4 gap-y-3", !inline && "flex-wrap")}>
          <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !inline && "basis-56")}>
            <h3 className="text-sm font-semibold">{title}</h3>
            {text && <div className="text-sm text-muted-foreground">{text}</div>}
          </div>
          {control && <div className="flex flex-wrap gap-2">{control}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** An on/off switch. The label is read out by screen readers; the touch area is 44px tall. */
export function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="group -my-2.5 flex h-11 shrink-0 items-center rounded-full px-1 outline-none disabled:opacity-50"
    >
      <span
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span className={cn("absolute top-1 size-4 rounded-full bg-background shadow-sm transition-all", on ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}

/** A small set of choices where one is picked, like Dark / Light / System. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:min-h-9",
            value === o.value && "bg-card text-primary shadow-sm hover:text-primary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Button sizing for settings: 44px tall on phones, a little smaller on bigger screens. */
export const ROW_BUTTON = "h-11 px-4 sm:h-9";
