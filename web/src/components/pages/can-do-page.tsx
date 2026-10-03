"use client";

import { ChevronDownIcon } from "lucide-react";
import { KindList } from "@/components/can-do/kind-list";
import { kindRows, levelCounts, PERIODS, type Period } from "@/components/can-do/kinds";
import { TrustLadder } from "@/components/can-do/trust-ladder";
import { KindsOfEmailList, usePermissions } from "@/components/kinds-of-email";
import { Panel } from "@/components/kit/panel";
import { Loading, Page, PageHeader } from "@/components/page";
import { within } from "@/lib/insights";
import { wouldOnly } from "@/lib/labels";
import { useLocalSetting } from "@/lib/local-setting";
import { isReadOnly, useOscar, type OscarData } from "@/lib/use-oscar";

function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">Period</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Period)}
        className="min-h-11 appearance-none rounded-full border bg-card py-2 pr-9 pl-4 text-sm font-medium shadow-card hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden />
    </label>
  );
}

/** What the bars mean, in words that never claim he did something he only would have. */
function captionFor(data: OscarData, items: OscarData["items"]) {
  if (isReadOnly(data)) {
    return "He only reads your Gmail for now, so each bar shows how much of that kind he would handle on his own, without asking you.";
  }
  if (items.some((i) => i.decision.source === "gmail")) {
    const would = items.some((i) => wouldOnly(i.decision))
      ? " Some are from before he could act in Gmail, or are things he doesn't do there, so he only would have."
      : "";
    return `Each bar shows how much of that kind he decided on his own, without asking you.${would} What he really did in Gmail is counted beside it.`;
  }
  return "Each bar shows how much of that kind he handled on his own, without asking you.";
}

/** What Oscar may do on his own, by kind of email, and how he earns more. */
export function CanDoPage() {
  const { data, error } = useOscar();
  const { rows: rules, failed } = usePermissions();
  const [period, setPeriod] = useLocalSetting<Period>("canDo.period", "30");

  if (!data) {
    return (
      <Page>
        <PageHeader title="What Oscar can do" />
        <Loading error={error} />
      </Page>
    );
  }

  const chosen = PERIODS.find((p) => p.value === period) ?? PERIODS[1];
  const items = chosen.value === "all" ? data.items : within(data.items, Number(chosen.value));
  const rows = kindRows(items, rules);
  const readOnly = isReadOnly(data);
  const empty = data.items.length
    ? `No emails ${chosen.phrase}. Try a longer period.`
    : data.gmail.connected
      ? "He hasn't read any emails yet. Check now from Home and they'll show up here."
      : "No emails yet. Bring in the demo inbox or connect Gmail in Settings, and they'll show up here.";

  return (
    <Page>
      <PageHeader title="What Oscar can do" text="Oscar earns more as you okay what he does.">
        <PeriodPicker value={chosen.value} onChange={setPeriod} />
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="By kind of email">
          <KindList
            rows={rows}
            rules={rules}
            rulesFailed={failed}
            caption={captionFor(data, items)}
            empty={empty}
            realInbox={!readOnly && items.some((i) => i.decision.source === "gmail")}
          />
        </Panel>
        <TrustLadder
          counts={items.length ? levelCounts(items) : null}
          phrase={chosen.phrase}
          readOnly={readOnly}
          rules={rules}
          senders={data.autonomy}
        />
      </div>

      <Panel as="div">
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col">
              <span className="font-semibold">Every kind, step by step</span>
              <span className="text-sm text-muted-foreground">Where he starts with each kind, before he&apos;s learned anything about a sender.</span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="pt-4">
            <KindsOfEmailList rows={rules} failed={failed} />
          </div>
        </details>
      </Panel>
    </Page>
  );
}
