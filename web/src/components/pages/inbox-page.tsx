"use client";

import { useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { EmailDetail } from "@/components/email-detail";
import { EmailListItem } from "@/components/email-list-item";
import { EmptyState } from "@/components/empty-state";
import { Loading, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { Level } from "@/lib/api";
import { statusLabel } from "@/lib/labels";
import { checkGmail } from "@/lib/demo";
import { setHash, useHash } from "@/lib/use-hash";
import { useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const FILTERS: (Level | "ALL")[] = ["ALL", "ASK_FIRST", "ESCALATE", "PROCEED_AND_NOTIFY", "PROCEED_SILENTLY"];

export function InboxPage() {
  const { data, error, feedback } = useOscar();
  const hash = useHash();
  const [filter, setFilter] = useState<Level | "ALL">("ALL");

  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const list = data.items.filter((i) => filter === "ALL" || i.decision.autonomy_level === filter);
  const picked = data.items.find((i) => i.decision.id === hash);
  // On a wide screen something is always open; on a narrow one the list shows until you pick one.
  const selected = picked ?? list[0];

  return (
    <Page className="max-w-7xl">
      <PageHeader
        title="Inbox"
        text={data.gmail.connected ? "Your Gmail, and what Oscar would do with each email. He only reads it." : "Every email, and what Oscar did with it."}
      />
      {data.items.length === 0 ? (
        data.gmail.connected ? (
          <EmptyState title="Nothing read yet." text="Oscar only reads your inbox. Nothing in Gmail changes.">
            <Button onClick={checkGmail}>Check for new email</Button>
          </EmptyState>
        ) : (
          <EmptyState title="Your inbox is empty." text="Bring in the demo emails from Settings to see Oscar at work." />
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className={cn("flex flex-col gap-3", picked && "hidden lg:flex")}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground",
                    filter === f && "border-transparent bg-foreground text-background hover:text-background",
                  )}
                >
                  {f === "ALL" ? "All" : statusLabel(f, data.gmail.connected)}
                </button>
              ))}
            </div>
            <ul className="flex flex-col gap-0.5 rounded-2xl border bg-card p-1.5">
              {list.map((item) => (
                <EmailListItem
                  key={item.decision.id}
                  item={item}
                  selected={item.decision.id === selected?.decision.id}
                  onSelect={() => setHash(item.decision.id)}
                />
              ))}
              {!list.length && <li className="p-4 text-sm text-muted-foreground">Nothing here.</li>}
            </ul>
          </div>

          <div className={cn("min-w-0", !picked && "hidden lg:block")}>
            {picked && (
              <Button variant="ghost" size="sm" className="mb-4 lg:hidden" onClick={() => setHash("")}>
                <ArrowLeftIcon /> Inbox
              </Button>
            )}
            {selected && (
              <EmailDetail item={selected} onFeedback={(kind, text) => feedback(selected.decision.id, kind, text)} />
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
