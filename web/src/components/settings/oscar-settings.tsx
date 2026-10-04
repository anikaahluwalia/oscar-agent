"use client";

import { useEffect, useState } from "react";
import {
  BellIcon,
  BrainIcon,
  MoveHorizontalIcon,
  PartyPopperIcon,
  RotateCwIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UserCheckIcon,
} from "lucide-react";
import { OscarAvatar } from "@/components/oscar-avatar";
import { Button } from "@/components/ui/button";
import { Segmented, SettingsGroup, SettingsRow, Switch, ROW_BUTTON } from "@/components/settings/rows";
import {
  clearLearning,
  getAppSettings,
  getLearning,
  renameLabel,
  restoreLearning,
  saveAppSettings,
  type AppSettings,
  type GmailStatus,
  type LabelRole,
} from "@/lib/api";
import { recheckRecent } from "@/lib/demo";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";

type Changes = Parameters<typeof saveAppSettings>[0];

/** The saved choices, and a way to change them. Each change is saved straight away. */
function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getAppSettings().then(setSettings, () => setFailed(true));
  }, []);
  async function change(changes: Changes) {
    if (!settings) return;
    // Show it at once; put it back if the API says no.
    const before = settings;
    setSettings({ ...settings, companion: { ...settings.companion, ...changes.companion }, notify: { ...settings.notify, ...changes.notify } });
    try {
      setSettings(await saveAppSettings(changes));
    } catch (e) {
      setSettings(before);
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    }
  }
  return { settings, failed, change, setSettings };
}

function Unavailable({ failed }: { failed: boolean }) {
  return <SettingsRow icon={BellIcon} tone="muted" title={failed ? "I can't reach my API" : "Getting your settings..."} />;
}

/** Oscar in the corner of Gmail (the Chrome extension): there or not, which side, and moving or still. */
function CompanionSettings({ app }: { app: ReturnType<typeof useAppSettings> }) {
  const { settings: s, failed, change } = app;
  return (
    <SettingsGroup title="Oscar in Gmail" note="Read by the Gmail extension">
      {!s ? (
        <Unavailable failed={failed} />
      ) : (
        <>
          <div className="flex gap-3.5 p-4 sm:px-5 sm:py-[18px]">
            <OscarAvatar size={40} />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="text-[15px] font-bold">Show Oscar in Gmail</h3>
                <p className="text-[13px] leading-normal text-muted-foreground">
                  Me in the corner, with a count of what needs you. The labels on your emails stay either way.
                </p>
              </div>
              <Switch label="Show Oscar in Gmail" on={s.companion.show} onChange={(show) => void change({ companion: { show } })} />
            </div>
          </div>
          <SettingsRow
            icon={MoveHorizontalIcon}
            tone={s.companion.show ? "primary" : "muted"}
            title="Position"
            text="Which corner I start in. You can still drag me along the bottom."
            control={
              <Segmented<"left" | "right">
                label="Position"
                value={s.companion.position}
                onChange={(position) => void change({ companion: { position } })}
                options={[
                  { value: "left", label: "Bottom left" },
                  { value: "right", label: "Bottom right" },
                ]}
              />
            }
          />
          <SettingsRow
            icon={SparklesIcon}
            tone={s.companion.show ? "primary" : "muted"}
            inline
            title="Animate"
            text="I pop up when I have something for you. Off keeps me still."
            control={<Switch label="Animate" on={s.companion.animate} onChange={(animate) => void change({ companion: { animate } })} />}
          />
        </>
      )}
    </SettingsGroup>
  );
}

const NOTIFY: { key: keyof AppSettings["notify"]; icon: typeof BellIcon; title: string; text: string }[] = [
  { key: "approvals", icon: UserCheckIcon, title: "Needs approval", text: "When an email waits for your yes." },
  { key: "safety", icon: ShieldAlertIcon, title: "Safety events", text: "When a safety rule stops an email." },
  { key: "handled", icon: PartyPopperIcon, title: "Handled actions", text: "When I archive, label or mark something as read on my own." },
];

/** Which cards Oscar shows in Gmail. */
function NotificationSettings({ app }: { app: ReturnType<typeof useAppSettings> }) {
  const { settings: s, failed, change } = app;
  return (
    <SettingsGroup title="Notifications" note="Cards from Oscar in Gmail">
      {!s ? (
        <Unavailable failed={failed} />
      ) : (
        NOTIFY.map((n) => (
          <SettingsRow
            key={n.key}
            icon={n.icon}
            tone={s.notify[n.key] ? "primary" : "muted"}
            inline
            title={n.title}
            text={n.text}
            control={<Switch label={n.title} on={s.notify[n.key]} onChange={(on) => void change({ notify: { [n.key]: on } })} />}
          />
        ))
      )}
    </SettingsGroup>
  );
}

// His Gmail labels, in the order they matter, each with the colour Gmail shows (oscar/labels.py COLOURS).
const LABELS: { role: LabelRole; colour: string; text: string }[] = [
  { role: "stopped", colour: "#fb4c2f", text: "A safety rule stopped this email." },
  { role: "needs_you", colour: "#ffad47", text: "I'm waiting for your yes." },
  { role: "fyi", colour: "#4a86e8", text: "I did it, or would, and I'm letting you know." },
  { role: "receipts", colour: "#a479e2", text: "What I put on receipts and orders when I label them." },
  { role: "sorted", colour: "#999999", text: "What I put on anything else I label." },
];

/** One label's name, edited in place and saved with Save (or Enter). */
function LabelRow({ role, colour, text, name, onSaved }: (typeof LABELS)[number] & { name: string; onSaved: (s: AppSettings) => void }) {
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const changed = draft.trim() !== name;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    try {
      const { settings, reply } = await renameLabel(role, draft);
      onSaved(settings);
      setDraft(settings.labels[role]);
      oscarSays(reply);
      notifyChanged();
    } catch (err) {
      oscarSays(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:px-5">
      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: colour }} />
      <div className="flex min-w-0 flex-1 basis-[12rem] flex-col gap-0.5">
        <label htmlFor={`label-${role}`} className="text-[15px] font-bold">
          {name}
        </label>
        <p className="text-[13px] text-muted-foreground">{text}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`label-${role}`}
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setDraft(name)}
          className="h-10 w-44 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" variant={changed ? "default" : "outline"} className={ROW_BUTTON} disabled={!changed || busy || !draft.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** What his Gmail labels are called. Renaming one renames it in Gmail too, so emails he already labelled follow. */
function LabelSettings({ app }: { app: ReturnType<typeof useAppSettings> }) {
  const { settings: s, failed, setSettings } = app;
  return (
    <SettingsGroup title="Gmail labels" note="Rename any of them">
      {!s ? (
        <Unavailable failed={failed} />
      ) : (
        <>
          <p className="p-4 text-[13px] leading-normal text-muted-foreground sm:px-5">
            The labels I put on your emails in Gmail. What I handled quietly gets no label. Renaming one renames it in Gmail too,
            so the emails I already labelled follow.
          </p>
          {LABELS.map((l) => (
            <LabelRow key={l.role} {...l} name={s.labels[l.role]} onSaved={setSettings} />
          ))}
        </>
      )}
    </SettingsGroup>
  );
}

/** Oscar in Gmail, Notifications and Gmail labels share one fetch of the saved choices. */
export function GmailCompanionSettings() {
  const app = useAppSettings();
  return (
    <>
      <CompanionSettings app={app} />
      <NotificationSettings app={app} />
      <LabelSettings app={app} />
    </>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Start learning afresh, without deleting anything, so it can be brought back. */
function ClearLearningRow() {
  const [cleared, setCleared] = useState<string | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getLearning().then(
      (r) => setCleared(r.cleared_at),
      () => setCleared(null),
    );
  }, []);

  async function run(work: () => Promise<{ cleared_at: string | null; reply: string }>) {
    setBusy(true);
    try {
      const r = await work();
      setCleared(r.cleared_at);
      oscarSays(r.reply);
      notifyChanged();
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <SettingsRow
      icon={BrainIcon}
      tone={confirming ? "blocked" : "muted"}
      title="Clear learned preferences"
      text={
        cleared
          ? `You cleared what I learned on ${when(cleared)}. I've been learning afresh since then.`
          : confirming
            ? "I'll stop using your answers so far and learn from scratch. Your emails, answers and categories are kept, and the safety rules don't change."
            : "Start fresh on this inbox: I forget your rules, patterns and sender habits. You can bring them back."
      }
      control={
        cleared ? (
          <Button variant="outline" className={ROW_BUTTON} disabled={busy} onClick={() => void run(restoreLearning)}>
            Bring it back
          </Button>
        ) : confirming ? (
          <>
            <Button variant="destructive" className={ROW_BUTTON} disabled={busy} onClick={() => void run(clearLearning)}>
              Yes, clear it
            </Button>
            <Button variant="outline" className={ROW_BUTTON} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="outline" className={ROW_BUTTON} disabled={cleared === undefined} onClick={() => setConfirming(true)}>
            Clear
          </Button>
        )
      }
    />
  );
}

/** Re-reading recent emails, and clearing what he learned. */
export function AdvancedSettings({ gmail }: { gmail: GmailStatus | undefined }) {
  return (
    <SettingsGroup title="Advanced">
      {gmail?.connected && (
        <SettingsRow
          icon={RotateCwIcon}
          tone="muted"
          title="Re-read recent emails"
          text="Your 50 most recent emails, read again by the latest Oscar. His old decisions and your reviews are kept; re-reads aren't counted in your results."
          control={
            <Button variant="outline" className={ROW_BUTTON} onClick={recheckRecent}>
              Re-read
            </Button>
          }
        />
      )}
      <ClearLearningRow />
    </SettingsGroup>
  );
}
