import Link from "next/link";
import { ArrowUpIcon } from "lucide-react";

/** Looks like a box to type in, but it's a link: the chat is where you tell Oscar things. */
export function TellOscar() {
  return (
    <Link
      href="/chat"
      className="flex items-center gap-2 rounded-full border bg-card py-[5px] pr-[5px] pl-[18px] hover:bg-surface-hover sm:py-1.5 sm:pr-1.5 sm:pl-[22px]"
    >
      <span className="min-w-0 flex-1 truncate text-base text-muted-foreground">
        Tell Oscar…<span className="hidden sm:inline"> “always mark newsletters as read”</span>
      </span>
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <ArrowUpIcon className="size-5" />
      </span>
    </Link>
  );
}
