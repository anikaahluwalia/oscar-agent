"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { bringInDemo, startOver } from "@/lib/demo";
import { useLocalSetting } from "@/lib/local-setting";
import { cn } from "@/lib/utils";

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">{title}</h2>
        {note && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground",
            value === o.value && "bg-background text-foreground shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ id, label, text }: { id: string; label: string; text: string }) {
  const [on, setOn] = useLocalSetting<"on" | "off">(`notify.${id}`, id === "in-app" ? "on" : "off");
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on === "on"}
        aria-label={label}
        onClick={() => setOn(on === "on" ? "off" : "on")}
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on === "on" ? "bg-foreground" : "bg-muted")}
      >
        <span className={cn("absolute top-1 size-4 rounded-full bg-background transition-all", on === "on" ? "left-5" : "left-1")} />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  // The theme is only known in the browser, so nothing is selected until then.
  const inBrowser = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [autonomy, setAutonomy] = useLocalSetting<"cautious" | "balanced" | "independent">("autonomy", "balanced");

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Settings" />

      {/* These two aren't connected to Oscar yet, so they say so instead of pretending. */}
      <Group title="Notifications" note="Saved on this device · coming soon">
        <Toggle id="in-app" label="In-app" text="Heads-ups while you have Oscar open." />
        <Toggle id="push" label="Push" text="When something needs you." />
        <Toggle id="sms" label="SMS for urgent only" text="Only when Oscar stops something." />
        <Toggle id="digest" label="Daily digest" text="One email a day with everything Oscar did." />
      </Group>

      <Group title="Autonomy preference" note="Saved on this device · coming soon">
        <Segmented
          label="Autonomy preference"
          value={autonomy}
          onChange={setAutonomy}
          options={[
            { value: "cautious", label: "Cautious" },
            { value: "balanced", label: "Balanced" },
            { value: "independent", label: "Independent" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          This will change how often Oscar asks. Protected safety rules never change. For now Oscar learns from your
          answers instead; you can adjust each sender in What Oscar Knows.
        </p>
      </Group>

      <Group title="Appearance">
        <Segmented
          label="Appearance"
          value={(inBrowser ? theme : "") as "dark" | "light" | "system"}
          onChange={setTheme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "system", label: "System" },
          ]}
        />
      </Group>

      <Group title="Account">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Email account</p>
            <p className="text-sm text-muted-foreground">Not connected. Oscar is working on a set of example emails.</p>
          </div>
          <Button variant="outline" size="sm" disabled>
            Connect Gmail
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
          <div>
            <p className="text-sm font-medium">Demo inbox</p>
            <p className="text-sm text-muted-foreground">Bring in the example emails, or wipe everything Oscar has learned.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={bringInDemo}>
              Bring in emails
            </Button>
            <Button size="sm" variant="outline" onClick={startOver}>
              Start over
            </Button>
          </div>
        </div>
      </Group>
    </Page>
  );
}
