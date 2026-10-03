"use client";

import { Page, PageHeader } from "@/components/page";
import { GmailSettings, useGmailResult } from "@/components/settings/gmail-settings";
import {
  AppearanceRow,
  ChatRow,
  DataSettings,
  NameRow,
  NotificationSettings,
} from "@/components/settings/more-settings";
import { SettingsGroup } from "@/components/settings/rows";
import { useOscar } from "@/lib/use-oscar";

/** Settings as grouped rows: the email account, you, how Oscar sorts, notifications, looks, and data. */
export function SettingsPage() {
  const { data } = useOscar();
  const gmail = data?.gmail;
  useGmailResult();

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Settings" text="Your email account and how Oscar works for you." />

      <GmailSettings gmail={gmail} />

      <SettingsGroup title="You">
        <NameRow />
        <AppearanceRow />
      </SettingsGroup>

      <SettingsGroup title="How Oscar sorts">
        <ChatRow />
      </SettingsGroup>

      <NotificationSettings />

      {/* The demo inbox controls only make sense until Gmail is connected. */}
      <DataSettings demo={!!gmail && !gmail.connected} />
    </Page>
  );
}
