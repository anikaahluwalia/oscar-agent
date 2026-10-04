"use client";

import { useRouter } from "next/navigation";
import { FlaskConicalIcon } from "lucide-react";
import { Page } from "@/components/page";
import { GmailSettings, useGmailResult } from "@/components/settings/gmail-settings";
import { AppearanceRow, NameRow } from "@/components/settings/more-settings";
import { AdvancedSettings, GmailCompanionSettings } from "@/components/settings/oscar-settings";
import { ROW_BUTTON, SettingsGroup, SettingsRow } from "@/components/settings/rows";
import { Button } from "@/components/ui/button";
import { leaveDemo } from "@/lib/api";
import { useDemoSession, useOscar } from "@/lib/use-oscar";

/** In the demo, Gmail and everything kept with a real inbox isn't there to change; this says so. */
function DemoSettings() {
  const router = useRouter();
  return (
    <SettingsGroup title="Demo">
      <SettingsRow
        icon={FlaskConicalIcon}
        title="You're trying Oscar on a simulated inbox"
        text="Gmail and his Gmail labels are for a real inbox, so they're not here. Leave the demo to connect Gmail."
        control={
          <Button
            variant="outline"
            className={ROW_BUTTON}
            onClick={() => {
              leaveDemo();
              router.push("/");
            }}
          >
            Leave the demo
          </Button>
        }
      />
    </SettingsGroup>
  );
}

/** Settings under short headings: Gmail, Oscar in Gmail with his notifications and labels, you, the look, and advanced. */
export function SettingsPage() {
  const { data } = useOscar();
  const gmail = data?.gmail;
  const demo = !!useDemoSession();
  useGmailResult();

  return (
    <Page className="max-w-[840px] gap-10 sm:pt-12">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.03em] sm:text-[34px]">Settings</h1>
        <p className="text-base text-muted-foreground">Your Gmail, and how Oscar works for you.</p>
      </header>

      {demo ? <DemoSettings /> : <GmailSettings gmail={gmail} />}

      {!demo && <GmailCompanionSettings />}

      {/* Your name and the look, together, for the demo tour to point at. */}
      <div data-tour="settings-you" className="flex flex-col gap-10">
        <SettingsGroup title="You">
          <NameRow />
        </SettingsGroup>

        <SettingsGroup title="Appearance">
          <AppearanceRow />
        </SettingsGroup>
      </div>

      {/* Kept with a real inbox (or the shared example one), so not in the demo. */}
      {!demo && <AdvancedSettings gmail={gmail} />}
    </Page>
  );
}
