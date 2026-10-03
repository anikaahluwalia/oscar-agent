"use client";

import { Loading, Page, PageHeader } from "@/components/page";
import { LatestSafetyTest } from "@/components/safety/latest-safety-test";
import { ProtectionCard } from "@/components/safety/protection-card";
import { PROTECTIONS } from "@/components/safety/protections";
import { SafetyEvents } from "@/components/safety/safety-events";
import { SafetyHealth } from "@/components/safety/safety-health";
import { within } from "@/lib/insights";
import { isReadOnly, useOscar } from "@/lib/use-oscar";

/** The protections learning can't change, what they caught, and how they held up. */
export function SafetyPage() {
  const { data, error } = useOscar();
  const recent = data ? within(data.items, 30) : [];
  const readOnly = data ? isReadOnly(data) : false;

  return (
    <Page>
      <PageHeader title="Safety" text="These protections are always on. Oscar can't learn his way around them." />

      <section aria-labelledby="protections" className="flex flex-col gap-3">
        <h2 id="protections" className="sr-only">
          Protections
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PROTECTIONS.map((p) => (
            <ProtectionCard key={p.key} protection={p} count={data ? recent.filter((i) => p.matches(i.decision)).length : null} />
          ))}
        </ul>
      </section>

      {!data ? (
        <Loading error={error} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SafetyEvents items={data.items} readOnly={readOnly} />
          <div className="flex min-w-0 flex-col gap-6">
            <SafetyHealth data={data} readOnly={readOnly} />
            <LatestSafetyTest />
          </div>
        </div>
      )}
    </Page>
  );
}
