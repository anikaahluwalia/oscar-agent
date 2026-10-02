"use client";

import Link from "next/link";
import { setHash } from "@/lib/use-hash";

type Props = { id: string; className?: string; onClick?: () => void; children: React.ReactNode };

/**
 * A link that opens one email in All email. Next changes a same-page #hash without a
 * hashchange event, so on /email itself we set the hash ourselves.
 */
export function EmailLink({ id, className, onClick, children }: Props) {
  return (
    <Link
      href={`/email#${id}`}
      className={className}
      onClick={(e) => {
        onClick?.();
        if (window.location.pathname === "/email") {
          e.preventDefault();
          setHash(id);
        }
      }}
    >
      {children}
    </Link>
  );
}
