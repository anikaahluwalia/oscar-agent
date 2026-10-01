import { Badge } from "@/components/ui/badge";
import type { LearnedRow } from "@/lib/api";
import { LEVELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function LearnedList({ rows }: { rows: LearnedRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        I haven&apos;t learned anything yet. Tell me how I did on a few emails and I&apos;ll start to pick up your habits.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={`${row.sender}-${row.action}`} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">{sentence(row.sentence)}</p>
            {row.level && <Badge className={cn("shrink-0 border-0", LEVELS[row.level].badge)}>{LEVELS[row.level].label}</Badge>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {/* How sure Oscar is that you're fine with this: the Beta mean. */}
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-foreground/70" style={{ width: `${row.mean * 100}%` }} />
            </div>
            <span>
              {row.yes} yes · {row.no} no{row.always_ask && " · you asked me to always check"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
