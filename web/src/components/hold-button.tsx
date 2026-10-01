"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HOLD_MS = 900;

/** A button you have to press and hold, for saying yes to things that are hard to undo. */
export function HoldButton({ onConfirm, disabled, children, size = "sm" }: {
  onConfirm: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  size?: "sm" | "default" | "lg";
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => stop, []);

  return (
    <Button
      size={size}
      disabled={disabled}
      className="relative overflow-hidden"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && start()}
      onKeyUp={stop}
    >
      <span
        className={cn("absolute inset-y-0 left-0 bg-primary-foreground/25", holding ? "w-full" : "w-0")}
        style={{ transition: holding ? `width ${HOLD_MS}ms linear` : "none" }}
        aria-hidden
      />
      <span className="relative">{children}</span>
    </Button>
  );
}
