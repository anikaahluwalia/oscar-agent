import { displayName } from "@/components/kit/sender";
import { EmailLink } from "@/components/email-link";
import type { DecisionWithFeedback, Reminder } from "@/lib/api";

const day = (d: Date) => d.toLocaleDateString([], { weekday: "short" }).toUpperCase();

function clock(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Events and due dates from your emails, soonest first, until the day has passed. */
export function upcoming(items: DecisionWithFeedback[], now: number) {
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const seen = new Set<string>();
  return items
    .filter((i): i is DecisionWithFeedback & { decision: { reminder: Reminder } } => !!i.decision.reminder)
    .filter((i) => i.decision.autonomy_level !== "ESCALATE" && !i.decision.safety_flags.length)
    .map((i) => ({ item: i, reminder: i.decision.reminder, when: new Date(`${i.decision.reminder.date}T00:00:00`) }))
    .filter((r) => !Number.isNaN(r.when.getTime()) && r.when.getTime() >= start)
    .sort((a, b) => a.when.getTime() - b.when.getTime() || (a.reminder.time ?? "").localeCompare(b.reminder.time ?? ""))
    .filter((r) => {
      const key = `${r.reminder.title.toLowerCase()}|${r.reminder.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

export function ComingUp({ items, now }: { items: DecisionWithFeedback[]; now: number }) {
  const rows = upcoming(items, now);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="coming-up" className="flex flex-col">
      <h2 id="coming-up" className="mb-2 text-lg font-bold">
        Coming up
      </h2>
      <ul className="flex flex-col">
        {rows.map(({ item, reminder, when }) => (
          <li key={item.decision.id} className="border-t first:border-t-0">
            <EmailLink id={item.decision.id} className="flex min-h-14 items-center gap-3 py-3 hover:bg-surface-hover sm:rounded-xl sm:px-2">
              <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-muted py-1.5 leading-tight">
                <span className="text-[11px] font-bold text-muted-foreground">{day(when)}</span>
                <span className="text-xl font-extrabold">{when.getDate()}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold">{reminder.title}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {[clock(reminder.time), reminder.detail, `from ${displayName(item.decision.sender)}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[13px] font-semibold text-muted-foreground">
                {reminder.kind === "due" ? "Due" : "Event"}
              </span>
            </EmailLink>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-muted-foreground">Found in your emails. Each one goes away once the day has passed.</p>
    </section>
  );
}
