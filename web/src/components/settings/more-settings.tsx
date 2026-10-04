"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { PaletteIcon, UserIcon } from "lucide-react";
import { Segmented, SettingsRow } from "@/components/settings/rows";
import { useYourName } from "@/lib/demo-name";
import { notifyChanged, useDemoSession } from "@/lib/use-oscar";

/** Your first name, kept in this browser. The Today page uses it to say hello when Google hasn't given one.
 * In the demo it's the name you gave the demo, which its emails use too. */
export function NameRow() {
  const [name, setName] = useYourName(useDemoSession());
  // What you're typing, so spaces aren't trimmed away mid-word. Saved as you go.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <SettingsRow
      icon={UserIcon}
      title={<label htmlFor="settings-name">Your name</label>}
      text="Oscar uses it to say hello. Kept in this browser only."
      control={
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
          onBlur={() => {
            setDraft(null);
            notifyChanged(); // so the demo's emails greet you by the new name
          }}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 sm:w-56"
        />
      }
    />
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
      title="Light or dark"
      text="Kept in this browser only."
      control={
        <Segmented<"light" | "dark" | "system">
          label="Appearance"
          value={inBrowser ? (theme as "light" | "dark" | "system" | undefined) : undefined}
          onChange={setTheme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "Match my device" },
          ]}
        />
      }
    />
  );
}
