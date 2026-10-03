"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  BellIcon,
  FolderLockIcon,
  InboxIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  NewspaperIcon,
  PaletteIcon,
  SmartphoneIcon,
  UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, SettingsGroup, SettingsRow, Switch, ROW_BUTTON } from "@/components/settings/rows";
import { getChatStatus, getInboxSettings, setInboxSettings, type BulkAction } from "@/lib/api";
import { bringInDemo, startOver } from "@/lib/demo";
import { useLocalSetting } from "@/lib/local-setting";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";

/** Your first name, kept in this browser. Home uses it to say hello. */
export function NameRow() {
  const [name, setName] = useLocalSetting<string>("name", "");
  // What you're typing, so spaces aren't trimmed away mid-word. Saved as you go.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <SettingsRow
      icon={UserIcon}
      title={<label htmlFor="settings-name">Your name</label>}
      text="Oscar uses it to say hello on Home. Kept in this browser only."
    >
      <input
        id="settings-name"
        type="text"
        value={draft ?? name}
        maxLength={40}
        autoComplete="given-name"
        placeholder="Your first name"
        onChange={(e) => {
          setDraft(e.target.value);
          setName(e.target.value.trim());
        }}
        onBlur={() => setDraft(null)}
        className="h-11 w-full max-w-xs rounded-xl border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
      />
    </SettingsRow>
  );
}

type PromoChoice = "MARK_READ" | "ARCHIVE" | "default";

/** What Oscar does with promos and newsletters on this inbox. Applies to emails he reads from now on. */
export function PromoRow() {
  // undefined while loading, "failed" if the API can't be reached.
  const [value, setValue] = useState<BulkAction | undefined | "failed">(undefined);
  useEffect(() => {
    getInboxSettings().then(
      (s) => setValue(s.bulk_action),
      () => setValue("failed"),
    );
  }, []);
  async function choose(next: BulkAction) {
    try {
      const saved = await setInboxSettings(next);
      setValue(saved.bulk_action);
      notifyChanged();
      oscarSays(
        next === "MARK_READ"
          ? "Got it! I'll mark promos and newsletters as read."
          : next === "ARCHIVE"
            ? "Got it! I'll archive promos and newsletters."
            : "Okay! I'll go back to my default.",
      );
    } catch {
      oscarSays("I can't reach my API right now.");
    }
  }
  const selected: PromoChoice | undefined = value === undefined || value === "failed" ? undefined : (value ?? "default");
  return (
    <SettingsRow
      icon={MegaphoneIcon}
      title="Promotions and newsletters"
      text="For mail sent to a list: promos, newsletters, job alerts. Oscar still asks first until you've okayed a sender, and anything risky is still stopped. Applies to emails he reads from now on."
    >
      <Segmented<PromoChoice>
        label="Promotions and newsletters"
        value={selected}
        onChange={(v) => choose(v === "default" ? null : v)}
        options={[
          { value: "MARK_READ", label: "Mark as read" },
          { value: "ARCHIVE", label: "Archive" },
          { value: "default", label: "Oscar's default" },
        ]}
      />
      {value === "failed" && <p className="text-sm text-muted-foreground">I can&apos;t reach my API right now, so I can&apos;t show what&apos;s picked.</p>}
    </SettingsRow>
  );
}

/** Which chat Oscar uses, and what leaves this computer when you use it. */
export function ChatRow() {
  const [model, setModel] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    getChatStatus().then(
      (s) => setModel(s.model),
      () => setModel(null),
    );
  }, []);
  let text: React.ReactNode;
  if (model === undefined) text = "Checking...";
  else if (!model)
    text = (
      <>
        Basic chat: Oscar understands a few questions. For a smarter chat, add a free Gemini key to <code>.env</code> as{" "}
        <code>GEMINI_API_KEY</code> and restart the API.
      </>
    );
  else
    text = (
      <div className="flex flex-col gap-1">
        <p>
          Using <span className="font-medium text-foreground">{model}</span>.
        </p>
        <p>
          When you ask about emails, their sender, subject and preview are sent to Google. On Gemini&apos;s free tier, Google
          may use them to improve its products. Oscar never sends whole emails, and the chat can&apos;t change anything without
          your yes.
        </p>
      </div>
    );
  return <SettingsRow icon={MessageCircleIcon} title="Chat" text={text} />;
}

const NOTIFICATIONS = [
  { id: "in-app", icon: BellIcon, label: "In-app", text: "Heads-ups while you have Oscar open." },
  { id: "push", icon: SmartphoneIcon, label: "Push", text: "When something needs you." },
  { id: "sms", icon: MessageSquareIcon, label: "SMS for urgent only", text: "Only when Oscar stops something." },
  { id: "digest", icon: NewspaperIcon, label: "Daily digest", text: "One email a day with everything Oscar did." },
] as const;

function NotificationRow({ id, icon, label, text }: (typeof NOTIFICATIONS)[number]) {
  const [on, setOn] = useLocalSetting<"on" | "off">(`notify.${id}`, id === "in-app" ? "on" : "off");
  return (
    <SettingsRow
      icon={icon}
      tone="muted"
      inline
      title={label}
      text={text}
      control={<Switch label={label} on={on === "on"} onChange={(next) => setOn(next ? "on" : "off")} />}
    />
  );
}

export function NotificationSettings() {
  return (
    <SettingsGroup title="Notifications" note="Saved on this device · coming soon">
      {NOTIFICATIONS.map((n) => (
        <NotificationRow key={n.id} {...n} />
      ))}
    </SettingsGroup>
  );
}

export function AppearanceRow() {
  const { theme, setTheme } = useTheme();
  // The theme is only known in the browser, so nothing is selected until then.
  const inBrowser = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <SettingsRow
      icon={PaletteIcon}
      title="Appearance"
      text="Kept in this browser only."
      control={
        <Segmented<"light" | "dark" | "system">
          label="Appearance"
          value={inBrowser ? (theme as "light" | "dark" | "system" | undefined) : undefined}
          onChange={setTheme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
        />
      }
    />
  );
}

const KEPT = [
  "Oscar's decisions, your answers and reviews, and what he's learned from them.",
  "Your Gmail sign-in, if you connect it.",
  "The demo inbox and your real inbox are kept apart, so what he learns on the examples never changes how he treats your real email.",
];

/** Where Oscar keeps things, and (on the demo inbox) bringing in emails or starting over. */
export function DataSettings({ demo }: { demo: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <SettingsGroup title="Data">
      <SettingsRow
        icon={FolderLockIcon}
        title="Where Oscar keeps things"
        text={
          <>
            On this computer, in the <code>data</code> folder. That folder is left out of git, so none of it ever ends up in the
            repo. Your name, notifications and appearance stay in this browser.
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {KEPT.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </SettingsRow>
      {demo && (
        <SettingsRow
          icon={InboxIcon}
          title="Demo inbox"
          text={
            confirming
              ? "Start over forgets every decision on the example emails and everything Oscar learned from your answers. This can't be undone."
              : "Bring in the example emails, or start over and wipe everything Oscar has learned on them."
          }
          tone={confirming ? "blocked" : "primary"}
          control={
            confirming ? (
              <>
                <Button
                  variant="destructive"
                  className={ROW_BUTTON}
                  onClick={async () => {
                    setConfirming(false);
                    await startOver();
                  }}
                >
                  Yes, start over
                </Button>
                <Button variant="outline" className={ROW_BUTTON} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button className={ROW_BUTTON} onClick={bringInDemo}>
                  Bring in emails
                </Button>
                <Button variant="outline" className={ROW_BUTTON} onClick={() => setConfirming(true)}>
                  Start over
                </Button>
              </>
            )
          }
        />
      )}
    </SettingsGroup>
  );
}
