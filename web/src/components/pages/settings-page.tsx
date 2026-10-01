"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { gmailConnectUrl } from "@/lib/api";
import { bringInDemo, checkGmail, disconnectGmailAccount, startOver } from "@/lib/demo";
import { notifyChanged, oscarSays, useOscar } from "@/lib/use-oscar";
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

/** After Google sends you back, say how connecting went, then tidy the URL. */
function useGmailResult() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("gmail");
    if (!result) return;
    if (result === "connected") oscarSays("Gmail is connected. I'll only read it; nothing in Gmail will change.");
    else if (result === "not_configured") oscarSays("Gmail isn't set up yet. Add your Google keys to .env first.");
    else oscarSays(params.get("reason") ?? "Connecting Gmail didn't work.");
    notifyChanged();
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
}

function GmailAccount() {
  const { data } = useOscar();
  const gmail = data?.gmail;
  if (!gmail) return <p className="text-sm text-muted-foreground">Checking...</p>;

  if (!gmail.connected && !gmail.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Gmail isn&apos;t set up yet. Copy <code>.env.example</code> to <code>.env</code>, add your Google client ID and
        secret, and restart the API.
      </p>
    );
  }
  if (!gmail.connected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-md text-sm text-muted-foreground">
          Oscar is working on example emails. Connect Gmail and he&apos;ll read your real inbox. He only reads it: nothing
          in Gmail changes, and you review what he would have done.
        </p>
        <Button asChild size="sm">
          <a href={gmailConnectUrl}>Connect Gmail</a>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{gmail.address}</p>
          <p className="text-sm text-muted-foreground">
            {gmail.last_sync ? `Last checked ${new Date(gmail.last_sync * 1000).toLocaleString()}` : "Not checked yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={checkGmail}>
            Check for new email
          </Button>
          <Button size="sm" variant="outline" onClick={disconnectGmailAccount}>
            Disconnect
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Oscar can read your inbox but can&apos;t change anything in it. Disconnecting keeps his decisions and your reviews.
      </p>
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data } = useOscar();
  const gmail = data?.gmail;
  useGmailResult();
  // The theme is only known in the browser, so nothing is selected until then.
  const inBrowser = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [autonomy, setAutonomy] = useLocalSetting<"cautious" | "balanced" | "independent">("autonomy", "balanced");

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Settings" />

      <Group title="Email account" note={gmail?.connected ? "Read-only" : undefined}>
        <GmailAccount />
      </Group>

      {!gmail?.connected && (
        <Group title="Demo inbox">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Bring in the example emails, or wipe everything Oscar has learned.</p>
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
      )}

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

    </Page>
  );
}
