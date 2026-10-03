"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export type Tab<T extends string> = { key: T; label: string; count: number };

/** The two tabs on the Memory page, as real tabs: arrow keys move between them, and each is 44px tall to tap. */
export function MemoryTabs<T extends string>({
  tabs,
  value,
  onChange,
  idFor,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (key: T) => void;
  idFor: (key: T) => string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, by: number) => {
    const next = (from + by + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="What Oscar remembers" className="flex flex-wrap gap-2">
      {tabs.map((t, i) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="tab"
            id={`${idFor(t.key)}-tab`}
            aria-selected={selected}
            aria-controls={idFor(t.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i, 1);
              if (e.key === "ArrowLeft") move(i, -1);
            }}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium hover:bg-surface-hover",
              selected && "border-transparent bg-primary/10 text-primary hover:bg-primary/15",
            )}
          >
            {t.label}
            <span className="tabular-nums opacity-70">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
