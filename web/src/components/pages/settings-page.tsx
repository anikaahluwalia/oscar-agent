"use client";

import { Page } from "@/components/page";
import { GmailSettings, useGmailResult } from "@/components/settings/gmail-settings";
import { AppearanceRow, ChatRow, DataSettings, NameRow } from "@/components/settings/more-settings";
import { AdvancedSettings, GmailCompanionSettings } from "@/components/settings/oscar-settings";
import { SettingsGroup } from "@/components/settings/rows";
import { useOscar } from "@/lib/use-oscar";

/** Settings under short headings: Gmail, Oscar in Gmail with his notifications and labels, you, the look, the chat, advanced, your data. */
export function SettingsPage() {
  const { data } = useOscar();
  const gmail = data?.gmail;
  useGmailResult();

  return (
    <Page className="max-w-[840px] gap-10 sm:pt-12">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.03em] sm:text-[34px]">Settings</h1>
        <p className="text-base text-muted-foreground">Your Gmail, and how Oscar works for you.</p>
      </header>

      <GmailSettings gmail={gmail} />

      <GmailCompanionSettings />

      <SettingsGroup title="You">
        <NameRow />
      </SettingsGroup>

      <SettingsGroup title="Appearance">
        <AppearanceRow />
      </SettingsGroup>

      <SettingsGroup title="Oscar's chat">
        <ChatRow />
      </SettingsGroup>

      <AdvancedSettings gmail={gmail} />

      {/* The demo inbox controls only make sense until Gmail is connected. */}
      <DataSettings demo={!!gmail && !gmail.connected} />
    </Page>
  );
}
