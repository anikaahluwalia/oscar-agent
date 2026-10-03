import { CalendarIcon, FileTextIcon } from "lucide-react";
import { displayName } from "@/components/kit/sender";
import { EmailLink } from "@/components/email-link";
import type { DecisionWithFeedback, Reminder } from "@/lib/api";

const SHOWN = 6;

function clock(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow", or "Wed, Oct 8". */
function dayName(when: Date, now: number) {
  const today = new Date(now);
  const days = Math.round((when.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return when.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Events and due dates from your emails, soonest first, until the day has passed. Never from emails he stopped or flagged as risky. */
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
    });
}

/** What's coming up, grouped by day: from the reminders Oscar found in your emails. */
export function ComingUp({ items, now }: { items: DecisionWithFeedback[]; now: number }) {
  const all = upcoming(items, now);
  const rows = all.slice(0, SHOWN);
  const days: { name: string; rows: typeof rows }[] = [];
  for (const r of rows) {
    const name = dayName(r.when, now);
    if (days.at(-1)?.name === name) days.at(-1)!.rows.push(r);
    else days.push({ name, rows: [r] });
  }
  return (
    <section aria-labelledby="coming-up" className="flex flex-col rounded-[24px] border bg-card px-5 py-5 sm:px-6">
      <div className="mb-2 flex min-h-11 items-center">
        <h2 id="coming-up" className="text-lg font-bold">
          Coming up
        </h2>
      </div>
      {!rows.length ? (
        <p className="py-6 text-[15px] text-muted-foreground">Nothing coming up.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((d) => (
            <div key={d.name} className="flex flex-col">
              <h3 className="border-b pb-1.5 text-sm font-semibold text-foreground/80">{d.name}</h3>
              <ul className="flex flex-col">
                {d.rows.map(({ item, reminder }) => (
                  <li key={item.decision.id}>
                    <EmailLink id={item.decision.id} className="flex items-center gap-3 py-2.5 hover:bg-surface-hover sm:rounded-xl sm:px-2">
                      <span className="w-16 shrink-0 text-sm text-muted-foreground tabular-nums">{clock(reminder.time) ?? "All day"}</span>
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                        {reminder.kind === "due" ? <FileTextIcon className="size-4" /> : <CalendarIcon className="size-4" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-semibold">{reminder.title}</span>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {[reminder.kind === "due" ? "Due" : null, reminder.detail, `from ${displayName(item.decision.sender)}`].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </EmailLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {all.length > SHOWN && (
            <p className="text-[13px] text-muted-foreground">and {(all.length - SHOWN).toLocaleString()} more later on</p>
          )}
        </div>
      )}
    </section>
  );
}
