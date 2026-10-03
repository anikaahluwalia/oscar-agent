"use client";

import { useEffect } from "react";
import { HandIcon, MailIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsGroup, SettingsRow, Switch, ROW_BUTTON } from "@/components/settings/rows";
import { getGmailStatus, gmailActUrl, gmailConnectUrl, setActing, type GmailStatus } from "@/lib/api";
import { checkGmail, disconnectGmailAccount, recheckRecent } from "@/lib/demo";
import { dayLabel, formatTime } from "@/lib/time";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";

// The API sends back a short code after Google; only these fixed words are ever shown,
// so a crafted link can't put words in Oscar's mouth.
const GMAIL_RESULTS: Record<string, string> = {
  connected: "Gmail is connected! Nothing in Gmail changes unless you let me act.",
  not_configured: "Gmail isn't set up yet. Add your Google keys to .env first.",
  expired: "That sign-in took too long. Try connecting again.",
  cancelled: "Google sign-in was cancelled.",
  not_granted: "Gmail access wasn't granted. Tick the Gmail box on Google's screen and try again.",
  no_lasting_access: "Google didn't give lasting access. Remove Oscar from your Google account's connections and connect again.",
  google_error: "Google didn't accept the sign-in. Try again.",
};

/** After Google sends you back, say how connecting went, then tidy the URL. */
export function useGmailResult() {
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

function lastChecked(gmail: GmailStatus) {
  const parts = [];
  if (gmail.last_sync) {
    const iso = new Date(gmail.last_sync * 1000).toISOString();
    const day = dayLabel(iso);
    const when = day === "Today" || day === "Yesterday" ? day.toLowerCase() : `on ${day}`;
    parts.push(`Last checked ${when} at ${formatTime(iso)}`);
  } else {
    parts.push("Not checked yet");
  }
  if (gmail.auto_check_minutes > 0) {
    parts.push(`he checks every ${gmail.auto_check_minutes} ${gmail.auto_check_minutes === 1 ? "minute" : "minutes"} while the API is running`);
  }
  return parts.join(" · ");
}

/** The email account: connect, check now, disconnect, letting Oscar act, and re-reading recent emails. */
export function GmailSettings({ gmail }: { gmail: GmailStatus | undefined }) {
  const note = gmail?.connected ? (gmail.acting ? "Oscar can act" : "Read-only") : undefined;
  return (
    <SettingsGroup title="Email account" note={note}>
      <AccountRow gmail={gmail} />
      {gmail?.connected && <ActingRow gmail={gmail} />}
      {gmail?.connected && (
        <SettingsRow
          icon={RotateCwIcon}
          tone="muted"
          title="Re-read recent emails"
          text="Re-read your 50 most recent emails with the latest Oscar. His old decisions and your reviews are kept; re-reads aren't counted in the real-inbox results."
          control={
            <Button variant="outline" className={ROW_BUTTON} onClick={recheckRecent}>
              Re-read
            </Button>
          }
        />
      )}
    </SettingsGroup>
  );
}

function AccountRow({ gmail }: { gmail: GmailStatus | undefined }) {
  if (!gmail) return <SettingsRow icon={MailIcon} title="Gmail" text="Checking..." />;

  if (!gmail.connected && !gmail.configured) {
    return (
      <SettingsRow
        icon={MailIcon}
        tone="muted"
        title="Gmail"
        text={
          <>
            Gmail isn&apos;t set up yet. Copy <code>.env.example</code> to <code>.env</code>, add your Google client ID and
            secret, and restart the API.
          </>
        }
      />
    );
  }

  if (!gmail.connected) {
    return (
      <SettingsRow
        icon={MailIcon}
        title="Gmail"
        text="Oscar is working on example emails. Connect Gmail and he'll read your real inbox. He only reads it: nothing in Gmail changes, and you review what he would have done."
        control={
          <Button asChild className={ROW_BUTTON}>
            <a href={gmailConnectUrl}>Connect Gmail</a>
          </Button>
        }
      />
    );
  }

  return (
    <SettingsRow
      icon={MailIcon}
      tone="handled"
      title={<span className="break-all">{gmail.address ?? "Gmail connected"}</span>}
      text={
        <div className="flex flex-col gap-2">
          <p>{lastChecked(gmail)}</p>
          <p>
            {gmail.acting
              ? "Oscar reads your inbox and does the undoable things below. Disconnecting keeps his decisions and your reviews."
              : "Oscar can read your inbox but can't change anything in it. Disconnecting keeps his decisions and your reviews."}
          </p>
        </div>
      }
      control={
        <>
          <Button className={ROW_BUTTON} onClick={checkGmail}>
            Check now
          </Button>
          <Button variant="destructive" className={ROW_BUTTON} onClick={disconnectGmailAccount}>
            Disconnect
          </Button>
        </>
      }
    />
  );
}

const ACTING_FACTS = [
  "He marks emails as read, archives them, and puts his own labels on them.",
  "On his own only when he's sure; otherwise he asks, and does it when you approve.",
  "Never sends, deletes, unsubscribes or touches money. Anything risky still comes to you.",
  "Every action can be undone. Only emails he reads from now on, at most 25 per check.",
];

/**
 * Stage 12: letting Oscar act in Gmail. Off until you turn it on, and only after Gmail was connected
 * with permission to change labels. He only marks read, archives and labels, and only new emails.
 */
function ActingRow({ gmail }: { gmail: GmailStatus }) {
  const facts = (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
      {ACTING_FACTS.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
  );

  if (!gmail.can_act) {
    return (
      <SettingsRow
        icon={HandIcon}
        title="Let Oscar act in Gmail"
        text="Off. He only reads your inbox."
        control={
          <Button asChild className={ROW_BUTTON}>
            <a href={gmailActUrl}>Give Oscar permission to act</a>
          </Button>
        }
      >
        {facts}
        <p className="text-xs text-muted-foreground">
          Google will ask you to allow Oscar to change your email&apos;s labels. You can turn acting off at any time.
        </p>
      </SettingsRow>
    );
  }

  async function toggle(on: boolean) {
    try {
      await setActing(on);
      notifyChanged();
      oscarSays(on ? "Okay! I'll take care of the easy ones from now on, and you can undo anything." : "Okay, I'll only read your inbox again.");
    } catch (e) {
      oscarSays(e instanceof Error ? e.message : "I can't reach my API right now.");
    }
  }

  return (
    <SettingsRow
      icon={HandIcon}
      inline
      title="Let Oscar act in Gmail"
      text={gmail.acting ? "On. He does the easy ones and asks about the rest." : "Off. He only reads your inbox."}
      control={<Switch label="Let Oscar act in Gmail" on={gmail.acting} onChange={toggle} />}
    >
      {facts}
    </SettingsRow>
  );
}
