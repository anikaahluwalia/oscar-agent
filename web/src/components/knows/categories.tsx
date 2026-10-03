"use client";

import { useState } from "react";
import { FolderIcon, PlusIcon, XIcon } from "lucide-react";
import { categoryKey, categoryOf, NewCategory } from "@/components/classify/category-pill";
import { displayName } from "@/components/kit/sender";
import { Button } from "@/components/ui/button";
import { assignCategory, deleteCategory, renameCategory, type Category } from "@/lib/api";
import { notifyChanged, oscarSays, type OscarData } from "@/lib/use-oscar";
import { matches } from "./patterns";

const mini = "h-9 rounded-full px-3.5 text-[13px] font-semibold";
const select =
  "h-9 max-w-44 rounded-full border bg-card px-3 text-[13px] font-medium outline-none hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50";

async function attempt(work: () => Promise<unknown>, said?: string) {
  try {
    await work();
    if (said) oscarSays(said);
    notifyChanged();
  } catch (e) {
    oscarSays(e instanceof Error ? e.message : "Something went wrong.");
  }
}

/** One category: rename it, delete it, and move or remove its senders. */
function CategoryCard({ category, all, senders, names }: { category: Category; all: Category[]; senders: string[]; names: Map<string, string> }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, said?: string) => {
    setBusy(true);
    await attempt(work, said);
    setBusy(false);
  };
  const others = all.filter((c) => c.id !== category.id);
  const label = (s: string) => names.get(s) ?? s;
  // Senders you've had email from who aren't in this category yet.
  const addable = [...names.keys()].filter((s) => !category.senders.includes(s)).sort((a, b) => label(a).localeCompare(label(b)));

  return (
    <li className="flex flex-col gap-3 rounded-[22px] border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <FolderIcon className="size-[18px] text-muted-foreground" strokeWidth={1.9} />
        </span>
        {renaming ? (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void run(() => renameCategory(category.id, name.trim()), `It's called ${name.trim()} now.`).then(() => setRenaming(false));
            }}
          >
            <label className="sr-only" htmlFor={`rename-${category.id}`}>
              New name for {category.name}
            </label>
            <input
              id={`rename-${category.id}`}
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              className="h-9 w-48 rounded-full border bg-card px-3.5 text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button type="submit" className={mini} disabled={busy || !name.trim()}>
              Save
            </Button>
            <Button type="button" variant="ghost" className={mini} onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 basis-[calc(100%-3.25rem)] flex-col sm:basis-auto">
              <p className="text-[15px] font-bold break-words">{category.name}</p>
              <p className="text-[13px] text-muted-foreground">
                {senders.length === 1 ? "1 sender" : `${senders.length} senders`}
              </p>
            </div>
            {confirm ? (
              <div role="group" aria-label={`Delete ${category.name}?`} className="flex flex-wrap items-center gap-2">
                <span className="text-[13px]">Delete it? Its senders stay, just without a category.</span>
                <Button variant="destructive" className={mini} disabled={busy} onClick={() => void run(() => deleteCategory(category.id), `I deleted ${category.name}.`)}>
                  Delete
                </Button>
                <Button variant="outline" className={mini} onClick={() => setConfirm(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className={mini} onClick={() => setRenaming(true)}>
                  Rename
                </Button>
                <Button variant="outline" className={mini} onClick={() => setConfirm(true)}>
                  Delete
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {senders.length > 0 && (
        <ul className="flex flex-col divide-y border-t">
          {senders.map((s) => (
            <li key={s} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm" title={s}>
                {label(s)}
              </span>
              {others.length > 0 && (
                <>
                  <label className="sr-only" htmlFor={`move-${category.id}-${s}`}>
                    Move {label(s)} to another category
                  </label>
                  <select
                    id={`move-${category.id}-${s}`}
                    value=""
                    disabled={busy}
                    onChange={(e) => {
                      const to = others.find((c) => c.id === e.target.value);
                      if (to) void run(() => assignCategory(s, to.id), `${label(s)} is in ${to.name} now.`);
                    }}
                    className={select}
                  >
                    <option value="">Move to...</option>
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <Button
                variant="ghost"
                className="size-9 rounded-full p-0 text-muted-foreground"
                disabled={busy}
                aria-label={`Remove ${label(s)} from ${category.name}`}
                onClick={() => void run(() => assignCategory(s, null), `${label(s)} isn't in a category now.`)}
              >
                <XIcon className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {addable.length > 0 && (
        <div className="flex border-t pt-3">
          <label className="sr-only" htmlFor={`add-${category.id}`}>
            Add a sender to {category.name}
          </label>
          <select
            id={`add-${category.id}`}
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && void run(() => assignCategory(e.target.value, category.id), `${label(e.target.value)} is in ${category.name} now.`)}
            className={select}
          >
            <option value="">Add a sender...</option>
            {addable.map((s) => (
              <option key={s} value={s}>
                {label(s)}
                {categoryOf(all, s) ? ` (now in ${categoryOf(all, s)!.name})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}

/**
 * Your own categories (Shopping, School...): only for you to sort and browse by. They're kept apart
 * from the kind of email Oscar reads, and his decisions and the safety checks never look at them.
 */
export function Categories({ data, query }: { data: OscarData; query: string }) {
  const [creating, setCreating] = useState(false);
  // Every sender he's read, by address, with the name to show.
  const names = new Map<string, string>();
  for (const { decision } of data.items) names.set(categoryKey(decision.sender), displayName(decision.sender));
  const shown = data.categories
    .map((c) => ({ c, senders: c.senders.filter((s) => matches(query, c.name, s, names.get(s))) }))
    .filter(({ c, senders }) => matches(query, c.name) || senders.length > 0)
    .map(({ c, senders }) => ({ c, senders: matches(query, c.name) ? c.senders : senders }));

  return (
    <section aria-labelledby="knows-categories" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="knows-categories" className="text-lg font-bold">
            Your categories
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Your own way of sorting senders, to browse your Inbox by. They don&apos;t change what I do, and never get past a safety rule.
          </p>
        </div>
        {!creating && (
          <Button variant="outline" className={mini} onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden /> New category
          </Button>
        )}
      </div>
      {creating && (
        <NewCategory
          onCancel={() => setCreating(false)}
          onDone={(c) => {
            setCreating(false);
            oscarSays(`I made ${c.name}. Add senders to it here or from any email.`);
            notifyChanged();
          }}
        />
      )}
      {shown.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map(({ c, senders }) => (
            <CategoryCard key={c.id} category={c} all={data.categories} senders={senders} names={names} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-1 rounded-2xl border border-dashed px-5 py-6">
          <p className="font-semibold">{query && data.categories.length ? "No categories match your search" : "No categories yet"}</p>
          <p className="text-[13px] text-muted-foreground">
            {query && data.categories.length ? "Try another word, or clear the search." : "Make one like Shopping or School, then put senders in it."}
          </p>
        </div>
      )}
    </section>
  );
}
