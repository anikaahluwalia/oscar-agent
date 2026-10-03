import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A short heading, then a white card of settings rows split by thin lines. */
export function SettingsGroup({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
      </div>
      <div className="flex flex-col divide-y rounded-[20px] border bg-card">{children}</div>
    </section>
  );
}

/**
 * One setting: an icon, what it is, one short line about it, and its control on the right
 * (under the text on a phone). Anything longer (a list of facts) goes in `children`, under the text.
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
    primary: "bg-muted text-foreground",
    handled: "bg-status-handled/10 text-status-handled",
    blocked: "bg-status-blocked/10 text-status-blocked",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className="flex gap-3.5 p-4 sm:px-5 sm:py-[18px]">
      <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tint)}>
        <Icon className="size-[18px]" strokeWidth={1.9} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className={cn("flex gap-x-4 gap-y-3", inline ? "items-center justify-between" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="text-[15px] font-bold">{title}</h3>
            {text && <div className="text-[13px] leading-normal text-muted-foreground">{text}</div>}
          </div>
          {control && <div className="flex shrink-0 flex-wrap gap-2">{control}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Small print under a row: a few plain facts as a list. */
export function Facts({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-normal text-muted-foreground">
      {items.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
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

/** A small set of choices where one is picked, like Light / Dark / Match my device. */
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
    <div role="group" aria-label={label} className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-muted p-1 sm:rounded-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-full px-2.5 text-[13px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground sm:min-h-9 sm:px-3.5 sm:text-sm",
            value === o.value && "bg-card text-foreground shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Button sizing for settings: 44px tall on phones, a little smaller on bigger screens. */
export const ROW_BUTTON = "h-11 px-4 font-semibold sm:h-9";
