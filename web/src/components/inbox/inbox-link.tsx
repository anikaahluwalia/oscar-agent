"use client";

import Link from "next/link";
import { setHash } from "@/lib/use-hash";

type Props = Omit<React.ComponentProps<typeof Link>, "href"> & { id: string };

/**
 * A link that opens one email in the Inbox. Next changes a same-page #hash without a
 * hashchange event, so on /inbox itself we set the hash ourselves.
 */
export function InboxLink({ id, onClick, ...props }: Props) {
  return (
    <Link
      {...props}
      href={`/inbox#${id}`}
      onClick={(e) => {
        onClick?.(e);
        if (window.location.pathname === "/inbox") {
          e.preventDefault();
          setHash(id);
        }
      }}
    />
  );
}
