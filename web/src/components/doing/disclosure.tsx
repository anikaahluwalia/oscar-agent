"use client";

import { useId, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A plain link-style button that opens what's under it, so the extra detail stays out of the way until you want it. */
export function Disclosure({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="-mx-1 flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-[15px] font-semibold underline underline-offset-4 hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {label}
        <ChevronDownIcon className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={id} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
