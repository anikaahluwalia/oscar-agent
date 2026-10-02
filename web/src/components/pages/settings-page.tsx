"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { getChatStatus, getGmailStatus, getInboxSettings, gmailConnectUrl, setInboxSettings, type BulkAction } from "@/lib/api";
import { bringInDemo, checkGmail, disconnectGmailAccount, recheckRecent, startOver } from "@/lib/demo";
import { notifyChanged, oscarSays, useOscar } from "@/lib/use-oscar";
import { useLocalSetting } from "@/lib/local-setting";
import { cn } from "@/lib/utils";

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card shadow-card p-5">
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
// The API sends back a short code; only these fixed words are ever shown, so a crafted link can't put words in Oscar's mouth.
const GMAIL_RESULTS: Record<string, string> = {
  connected: "Gmail is connected! I'll only read it, so nothing in Gmail will change.",
  not_configured: "Gmail isn't set up yet. Add your Google keys to .env first.",
  expired: "That sign-in took too long. Try connecting again.",
  cancelled: "Google sign-in was cancelled.",
  not_granted: "Gmail access wasn't granted. Tick the Gmail box on Google's screen and try again.",
  no_lasting_access: "Google didn't give lasting access. Remove Oscar from your Google account's connections and connect again.",
  google_error: "Google didn't accept the sign-in. Try again.",
};

function useGmailResult() {
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("gmail");
    if (!result) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (result !== "connected") {
      oscarSays(GMAIL_RESULTS[result] ?? GMAIL_RESULTS.google_error);
      return;
    }
    // Only say it's connected if it really is.
    getGmailStatus()
      .then((s) => s.connected && oscarSays(GMAIL_RESULTS.connected))
      .catch(() => {})
      .finally(notifyChanged);
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
            {gmail.auto_check_minutes > 0 &&
              ` · Oscar checks every ${gmail.auto_check_minutes} ${gmail.auto_check_minutes === 1 ? "minute" : "minutes"} while the API is running`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={checkGmail}>
            Check now
          </Button>
          <Button size="sm" variant="outline" onClick={disconnectGmailAccount}>
            Disconnect
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Oscar can read your inbox but can&apos;t change anything in it. Disconnecting keeps his decisions and your reviews.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
        <p className="max-w-md text-sm text-muted-foreground">
          Re-read your 50 most recent emails with the latest Oscar. His old decisions and your reviews are kept; re-reads
          aren&apos;t counted in the real-inbox results.
        </p>
        <Button size="sm" variant="outline" onClick={recheckRecent}>
          Re-read recent emails
        </Button>
      </div>
    </div>
  );
}

/** What Oscar does with promos and newsletters on this inbox. Applies to emails he reads from now on. */
function PromoSetting() {
  const [value, setValue] = useState<BulkAction | undefined>(undefined);
  useEffect(() => {
    getInboxSettings().then((s) => setValue(s.bulk_action), () => setValue(null));
  }, []);
  async function choose(next: BulkAction) {
    try {
      const saved = await setInboxSettings(next);
      setValue(saved.bulk_action);
      oscarSays(next === "MARK_READ" ? "Got it! I'll mark promos and newsletters as read." : next === "ARCHIVE" ? "Got it! I'll archive promos and newsletters." : "Okay! I'll go back to my default.");
    } catch {
      oscarSays("I can't reach my API right now.");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        label="Promotions and newsletters"
        value={(value === undefined ? "" : value ?? "default") as "MARK_READ" | "ARCHIVE" | "default"}
        onChange={(v) => choose(v === "default" ? null : v)}
        options={[
          { value: "MARK_READ", label: "Mark as read" },
          { value: "ARCHIVE", label: "Archive" },
          { value: "default", label: "Oscar's default" },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        For mail sent to a list: promos, newsletters, job alerts. Oscar still asks first until you&apos;ve okayed a sender, and
        anything risky is still stopped. Applies to emails he reads from now on.
      </p>
    </div>
  );
}

function ChatSetting() {
  const [model, setModel] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    getChatStatus().then((s) => setModel(s.model), () => setModel(null));
  }, []);
  if (model === undefined) return <p className="text-sm text-muted-foreground">Checking...</p>;
  if (!model) {
    return (
      <p className="text-sm text-muted-foreground">
        Basic chat: Oscar understands a few questions. For a smarter chat, add a free Gemini key to <code>.env</code> as{" "}
        <code>GEMINI_API_KEY</code> and restart the API.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        Using <span className="font-medium">{model}</span>.
      </p>
      <p className="text-muted-foreground">
        When you ask about emails, their sender, subject and preview are sent to Google. On Gemini&apos;s free tier, Google
        may use them to improve its products. Oscar never sends whole emails, and the chat can&apos;t change anything without
        your yes.
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
      <Group title="Promotions and newsletters">
        <PromoSetting />
      </Group>

      <Group title="Chat">
        <ChatSetting />
      </Group>

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
