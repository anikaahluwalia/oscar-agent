"use client";

import { useEffect, useState } from "react";
import { HandIcon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Facts, SettingsGroup, SettingsRow, Switch, ROW_BUTTON } from "@/components/settings/rows";
import { getGmailStatus, gmailActUrl, gmailConnectUrl, setActing, type GmailStatus } from "@/lib/api";
import { checkGmail, disconnectGmailAccount } from "@/lib/demo";
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

/** The email account: who's connected, checking, disconnecting, letting Oscar act, and re-reading recent emails. */
export function GmailSettings({ gmail }: { gmail: GmailStatus | undefined }) {
  return (
    <SettingsGroup title="Gmail">
      {gmail?.connected ? <AccountCard gmail={gmail} /> : <ConnectRow gmail={gmail} />}
      {gmail?.connected && <ActingRow gmail={gmail} />}
    </SettingsGroup>
  );
}

/** Before Gmail is connected: still checking, not set up yet, or ready to connect. */
function ConnectRow({ gmail }: { gmail: GmailStatus | undefined }) {
  if (!gmail) return <SettingsRow icon={MailIcon} title="Gmail" text="Checking..." />;

  if (!gmail.configured) {
    return (
      <SettingsRow
        icon={MailIcon}
        tone="muted"
        title="Gmail isn't set up yet"
        text={
          <>
            Copy <code>.env.example</code> to <code>.env</code>, add your Google client ID and secret, and restart the API.
          </>
        }
      />
    );
  }

  return (
    <SettingsRow
      icon={MailIcon}
      title="Connect your Gmail"
      text="Oscar is working on example emails. Connect Gmail and he'll read your real inbox. He only reads it: nothing in Gmail changes, and you review what he would have done."
      control={
        <Button asChild className={ROW_BUTTON}>
          <a href={gmailConnectUrl}>Connect Gmail</a>
        </Button>
      }
    />
  );
}

/** Your Google photo, or your initial when Google didn't share one (or it won't load). */
function Photo({ gmail, size }: { gmail: GmailStatus; size: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (gmail.name ?? gmail.address ?? "?").trim().charAt(0).toUpperCase();
  if (gmail.picture && !broken) {
    return (
      // A plain img: the photo is on Google's server, and Next's image optimiser shouldn't fetch it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={gmail.picture}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

/** The connected account, like an account card: photo, name, address, and checking or disconnecting. */
function AccountCard({ gmail }: { gmail: GmailStatus }) {
  const title = gmail.name ?? gmail.address ?? "Gmail connected";
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Photo gmail={gmail} size={56} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-lg leading-tight font-bold break-words">{title}</h3>
            {gmail.name && gmail.address && <p className="text-sm break-all text-muted-foreground">{gmail.address}</p>}
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-level-silent" />
              {gmail.acting ? "Connected · Oscar can act" : "Connected · read-only"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className={ROW_BUTTON} onClick={checkGmail}>
            Check now
          </Button>
          <Button variant="destructive" className={ROW_BUTTON} onClick={disconnectGmailAccount}>
            Disconnect
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-[13px] leading-normal text-muted-foreground">
        <p>
          {gmail.acting
            ? "Oscar reads your inbox and can act. Disconnecting will keep his decisions and your reviews."
            : "Oscar reads your inbox but can't change it. Disconnecting will keep his decisions and your reviews."}
        </p>
        {/* Connected before Oscar asked Google for your profile. Keep the permission to act if it was given. */}
        {!gmail.name && (
          <p>
            <a
              href={gmail.can_act ? gmailActUrl : gmailConnectUrl}
              className="font-semibold text-foreground underline underline-offset-4 hover:no-underline"
            >
              Connect again
            </a>{" "}
            to show your name and photo.{gmail.acting && " Acting turns off until you switch it back on."}
          </p>
        )}
      </div>
    </div>
  );
}

const ACTING_FACTS = [
  "Marks read, archives and labels. If he isn't sure, he asks first.",
  "Never sends, deletes, unsubscribes or touches money.",
  "Everything can be undone. Only new emails.",
];

/**
 * Stage 12: letting Oscar act in Gmail. Off until you turn it on, and only after Gmail was connected
 * with permission to change labels. He only marks read, archives and labels, and only acts on new emails.
 */
function ActingRow({ gmail }: { gmail: GmailStatus }) {
  if (!gmail.can_act) {
    return (
      <SettingsRow
        icon={HandIcon}
        title="Let Oscar act in Gmail"
        text="He only reads your inbox."
        control={
          <Button asChild className={ROW_BUTTON}>
            <a href={gmailActUrl}>Give Oscar permission to act</a>
          </Button>
        }
      >
        <Facts items={ACTING_FACTS} />
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
      text={gmail.acting ? "He does the easy ones and asks about the rest." : "He only reads your inbox."}
      control={<Switch label="Let Oscar act in Gmail" on={gmail.acting} onChange={toggle} />}
    >
      <Facts items={ACTING_FACTS} />
    </SettingsRow>
  );
}
