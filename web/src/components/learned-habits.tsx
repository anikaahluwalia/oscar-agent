"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { memoryItems, notInGmail, onlyWould } from "@/components/memory/facts";
import { OtherSenders } from "@/components/memory/other-senders";
import { PreferenceCard } from "@/components/preference-card";
import type { FeedbackKind } from "@/lib/api";
import { useOscar, type OscarData } from "@/lib/use-oscar";

type TabKey = "learned" | "asks";
const panelId = (key: TabKey) => `memory-${key}`;

/** What Oscar has learned from you, in two tabs: habits he's picked up, and things he always asks about. */
export function LearnedHabits({ data }: { data: OscarData }) {
  const { feedback } = useOscar();
  const [tab, setTab] = useState<TabKey>("learned");
  const tell = (decisionId: string, kind: FeedbackKind) => feedback(decisionId, kind);

  const items = memoryItems(data);
  const learned = items.filter((i) => !i.asks);
  const asks = items.filter((i) => i.asks);
  const shown = tab === "learned" ? learned : asks;
  const anySure = shown.some((i) => !i.learned.always_ask && i.learned.yes + i.learned.no > 0);

  return (
    <div className="flex flex-col gap-5">
      <MemoryTabs
        tabs={[
          { key: "learned", label: "Learned", count: learned.length },
          { key: "asks", label: "Always asks", count: asks.length },
        ]}
        value={tab}
        onChange={setTab}
        idFor={panelId}
      />

      <div role="tabpanel" id={panelId(tab)} aria-labelledby={`${panelId(tab)}-tab`} className="flex flex-col gap-4">
        {tab === "asks" && asks.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Senders you asked me to always check with, or where you&apos;ve mostly turned me down. I&apos;ll keep asking.
          </p>
        )}

        {shown.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((item) => (
              <PreferenceCard
                key={`${item.learned.sender}|${item.learned.action}`}
                item={item}
                would={onlyWould(data, item.learned.action)}
                outsideGmail={notInGmail(data, item.learned.action)}
                onFeedback={tell}
              />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing learned yet"
            mood="curious"
            text={
              data.gmail.connected
                ? "Every okay, decline, undo and review teaches me a little about how you like things done. What I pick up shows here."
                : "Every okay, decline and undo teaches me a little about how you like things done. What I pick up shows here."
            }
          />
        ) : tab === "learned" ? (
          <EmptyState
            title="Nothing here right now"
            text="Everything I've learned so far is about things you want me to ask about. Those are under Always asks."
          />
        ) : (
          <EmptyState
            title="Nothing I always ask about"
            text="When you tell me to always ask, or mostly turn me down on something, it shows here."
          />
        )}

        {anySure && (
          <p className="text-xs text-muted-foreground">
            &ldquo;How sure&rdquo; is my own guess that you&apos;re fine with it. I start at 50% and every answer moves it.
          </p>
        )}
      </div>

      {tab === "learned" && <OtherSenders data={data} onFeedback={tell} />}
    </div>
  );
}
