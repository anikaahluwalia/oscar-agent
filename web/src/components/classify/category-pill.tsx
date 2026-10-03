"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, FolderIcon, PlusIcon } from "lucide-react";
import { addressOf, displayName } from "@/components/kit/sender";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignCategory, createCategory, type Category } from "@/lib/api";
import { notifyChanged, oscarSays, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const NONE = "none";

/** The sender's address the way categories keep it: lowercased, without the name. */
export const categoryKey = (sender: string) => (addressOf(sender) || sender).trim().toLowerCase();

/** Which of your categories this sender is in, if any. */
export function categoryOf(categories: Category[], sender: string): Category | undefined {
  const key = categoryKey(sender);
  return categories.find((c) => c.senders.includes(key));
}

/** A new category's name, typed in place. */
export function NewCategory({ onDone, onCancel, className }: { onDone: (c: Category) => void; onCancel: () => void; className?: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      onDone(await createCategory(name.trim()));
    } catch (err) {
      oscarSays(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} onKeyDown={(e) => e.key === "Escape" && onCancel()} className={cn("flex flex-wrap items-center gap-2", className)}>
      <label className="sr-only" htmlFor="new-category">
        New category name
      </label>
      <input
        ref={input}
        id="new-category"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        placeholder="Shopping, School, Family..."
        className="h-9 w-48 rounded-full border bg-card px-3.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button type="submit" className="h-9 rounded-full px-3.5 text-[13px]" disabled={busy || !name.trim()}>
        Add
      </Button>
      <Button type="button" variant="ghost" className="h-9 rounded-full px-3 text-[13px] text-muted-foreground" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/**
 * Your own category for this sender, as a pill you can change: Shopping, School, anything you make.
 * Only for you to sort and browse by. Oscar's decisions never look at it.
 */
export function CategoryPill({ sender, className }: { sender: string; className?: string }) {
  const { data } = useOscar();
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const categories = data?.categories ?? [];
  const current = categoryOf(categories, sender);
  const name = displayName(sender);

  async function put(category: Category | null) {
    if (busy) return;
    setBusy(true);
    try {
      await assignCategory(sender, category?.id ?? null);
      oscarSays(category ? `${name} is in ${category.name} now.` : `${name} isn't in a category now.`);
      notifyChanged();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label={current ? `Your category: ${current.name}. Change it` : "Add this sender to one of your categories"}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border bg-card px-3.5 text-[13px] font-semibold transition-colors hover:bg-surface-hover disabled:opacity-60",
              !current && "border-dashed text-muted-foreground",
            )}
          >
            <FolderIcon className="size-4 text-muted-foreground" strokeWidth={1.9} aria-hidden />
            {current?.name ?? "Category"}
            <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="font-semibold">Your category for {name}</span>
            <span className="text-xs text-muted-foreground">Just for you to sort by. It doesn&apos;t change what I do with their email.</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={current?.id ?? NONE}
            onValueChange={(id) => void put(id === NONE ? null : (categories.find((c) => c.id === id) ?? null))}
          >
            {categories.map((c) => (
              <DropdownMenuRadioItem key={c.id} value={c.id}>
                {c.name}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuRadioItem value={NONE}>No category</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <PlusIcon aria-hidden /> New category...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {creating && (
        <NewCategory
          onCancel={() => setCreating(false)}
          onDone={(c) => {
            setCreating(false);
            void put(c);
          }}
        />
      )}
    </span>
  );
}
