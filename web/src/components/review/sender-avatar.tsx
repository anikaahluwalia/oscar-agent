import { cn } from "@/lib/utils";

/** The sender's first letter. No logos: fetching one would send every sender's address to a logo service. */
export function SenderAvatar({ sender, size = 40, className }: { sender: string; size?: number; className?: string }) {
  const name = sender.replace(/<.*>/, "").trim() || sender;
  const letter = (name.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground", className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}
