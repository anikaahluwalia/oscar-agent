"use client";

import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { Categories } from "@/components/knows/categories";
import { PatternsLearned, RulesYouTaught, usePatterns } from "@/components/knows/patterns";
import { SendersIKnow } from "@/components/knows/senders-i-know";
import { MoodHeader } from "@/components/kit/mood-header";
import { Loading, Page } from "@/components/page";
import { useOscar } from "@/lib/use-oscar";

/**
 * What Oscar knows about you: the rules you taught him for kinds of email, the patterns your answers
 * add up to, what he learned about single senders, and your own categories. Kinds of email, your
 * categories, how much he involves you and the safety rules stay separate things.
 */
export function KnowsPage() {
  const { data, error, feedback } = useOscar();
  const { rows, failed } = usePatterns();
  const [now] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  return (
    <Page className="max-w-[1120px] gap-10">
      <MoodHeader pose="reporting" title="What I know about you" text="I picked these up from your answers. Change or forget any of them.">
        <div className="relative w-full xl:w-72">
          <label htmlFor="knows-search" className="sr-only">
            Search rules, patterns, senders and categories
          </label>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="knows-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search what I know"
            className="h-11 w-full rounded-full border bg-card pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </MoodHeader>
      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <RulesYouTaught rows={rows} failed={failed} query={query} />
          <PatternsLearned rows={rows} failed={failed} query={query} />
          <SendersIKnow data={data} onFeedback={feedback} now={now} query={query} />
          <Categories data={data} query={query} />
        </>
      )}
    </Page>
  );
}
