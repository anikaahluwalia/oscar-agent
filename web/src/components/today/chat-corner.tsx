import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { OscarMood } from "@/components/oscar-mood";

/** Oscar in the corner of Today with a speech bubble, so the chat is one click away. */
export function ChatCorner() {
  return (
    <Link
      href="/chat"
      aria-label="Chat with Oscar"
      className="group fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-end gap-1 md:right-6 md:bottom-6"
    >
      <span className="hidden w-44 rounded-2xl min-[1440px]:block rounded-br-sm border bg-card px-3.5 py-2.5 text-sm leading-snug shadow-card transition-colors group-hover:bg-surface-hover">
        <b className="font-bold">Want to chat?</b>
        <span className="block text-muted-foreground">Ask me anything about your email.</span>
      </span>
      <span className="relative">
        <OscarMood pose="typing" size={88} decorative className="size-16 transition-transform group-hover:-translate-y-0.5 min-[1440px]:size-[88px]" />
        {/* Where there's no room for the bubble, a small chat sign on him instead. */}
        <span aria-hidden className="absolute -top-1 -left-1 flex size-7 items-center justify-center rounded-full border bg-card shadow-card min-[1440px]:hidden">
          <MessageCircleIcon className="size-3.5" />
        </span>
      </span>
    </Link>
  );
}
