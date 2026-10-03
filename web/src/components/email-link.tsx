"use client";

import Link from "next/link";
import { setHash } from "@/lib/use-hash";

type Props = { id: string; className?: string; onClick?: () => void; children: React.ReactNode };

/**
 * A link that opens one email in Activity. Next changes a same-page #hash without a
 * hashchange event, so on /activity itself we set the hash ourselves.
 */
export function EmailLink({ id, className, onClick, children }: Props) {
  return (
    <Link
      href={`/inbox#${id}`}
      className={className}
      onClick={(e) => {
        onClick?.();
        if (window.location.pathname === "/inbox") {
          e.preventDefault();
          setHash(id);
        }
      }}
    >
      {children}
    </Link>
  );
}
