"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { Drawer } from "@/components/drawer";
import { OscarAvatar } from "@/components/oscar-avatar";
import { onOpenChat } from "@/lib/drawers";

/** The Ask Oscar button in the corner, and the drawer it opens, on every page. */
export function OscarChatDrawer() {
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenChat(setOpen), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {(
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex md:right-5 md:bottom-5 items-center gap-2 rounded-full border bg-card py-1.5 pr-4 pl-1.5 text-sm font-medium shadow-lg hover:bg-surface-hover"
        >
          <OscarAvatar size={28} />
          Ask Oscar
        </button>
      )}
      <Drawer
        open={open}
        onClose={close}
        title={
          <>
            <OscarAvatar size={28} /> Ask Oscar
          </>
        }
      >
        <ChatPanel variant="drawer" />
      </Drawer>
    </>
  );
}
