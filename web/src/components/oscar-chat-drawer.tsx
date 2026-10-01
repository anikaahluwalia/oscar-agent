"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatPanel } from "@/components/chat-panel";
import { Drawer } from "@/components/drawer";
import { OscarAvatar } from "@/components/oscar-avatar";
import { onOpenChat } from "@/lib/drawers";
import { useOscar } from "@/lib/use-oscar";

/** The Ask Oscar button in the corner, and the drawer it opens. Home has its own chat card, so no button there. */
export function OscarChatDrawer() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { data } = useOscar();
  // Home shows its own chat card once there are emails; everywhere else gets the button.
  const homeHasChat = path === "/home" && !!data?.items.length;
  useEffect(() => onOpenChat(setOpen), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {!homeHasChat && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 z-30 flex items-center gap-2 rounded-full border bg-card py-1.5 pr-4 pl-1.5 text-sm font-medium shadow-lg hover:bg-surface-hover"
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
