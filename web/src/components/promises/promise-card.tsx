import type { OscarPromise } from "@/components/promises/promises";
import { cn } from "@/lib/utils";

/** One thing Oscar never does alone: an icon tile, the promise, and one line on what it covers. */
export function PromiseCard({ promise: p }: { promise: OscarPromise }) {
  const Icon = p.icon;
  return (
    <li className="flex items-start gap-3.5 rounded-[20px] border bg-card p-[18px]">
      <span aria-hidden className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          p.group === "stop" ? "bg-status-blocked/10 text-status-blocked" : "bg-status-needs/10 text-status-needs",
        )}>
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="font-bold">{p.title}</h3>
        <p className="text-[13px] leading-normal text-muted-foreground">{p.line}</p>
      </div>
    </li>
  );
}
