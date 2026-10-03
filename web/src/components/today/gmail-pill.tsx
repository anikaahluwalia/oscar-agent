import type { GmailStatus } from "@/lib/api";

/** "3 minutes ago", from Oscar's last check of Gmail. */
function ago(seconds: number, now: number) {
  const mins = Math.max(0, Math.round((now - seconds * 1000) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return new Date(seconds * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Whether Gmail is connected, and when Oscar last checked it. Only shown for a real inbox. */
export function GmailPill({ gmail, now }: { gmail: GmailStatus; now: number }) {
  if (!gmail.connected) return null;
  return (
    <div className="flex items-center gap-2.5 self-start rounded-2xl border bg-card px-4 py-2.5 sm:self-center">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-status-handled" />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-medium">Gmail connected</span>
        {gmail.last_sync && <span className="text-xs text-muted-foreground">Last checked {ago(gmail.last_sync, now)}</span>}
      </span>
    </div>
  );
}
