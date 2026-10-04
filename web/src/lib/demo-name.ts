"use client";

// The name you give the demo, so its emails greet you instead of Anika, who they're written to. Kept
// in this browser like the tour's place: "<demo id>:<name>", with no name when you skipped. Reset demo
// forgets it, so it's asked again.

import { readSetting, useLocalSetting, writeSetting } from "@/lib/local-setting";

const KEY = "demo-name";

/** The name given in this demo: null when it hasn't been asked yet, "" when you skipped. */
function nameIn(saved: string | null, session: string | null): string | null {
  if (!session || !saved) return null;
  const at = saved.indexOf(":");
  return saved.slice(0, at) === session ? saved.slice(at + 1) : null;
}

export const demoName = (session: string | null) => nameIn(readSetting(KEY), session);
export const saveDemoName = (session: string, name: string) => writeSetting(KEY, `${session}:${name.trim().slice(0, 40)}`);
export const forgetDemoName = () => writeSetting(KEY, null);

export function useDemoName(session: string | null) {
  const [saved] = useLocalSetting<string>(KEY, "");
  return nameIn(saved, session);
}

/** Your name as Settings and Today use it: in the demo, the name you gave the demo. */
export function useYourName(session: string | null): [string, (name: string) => void] {
  const [saved, setSaved] = useLocalSetting<string>("name", "");
  const given = useDemoName(session);
  if (!session) return [saved, setSaved];
  return [given ?? "", (name) => saveDemoName(session, name)];
}

/** Your first name, or "" when you skipped. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * A demo email's text with your name in it: your first name where it greets you, your full name in a
 * guest list, and "there" and "You" when you skipped. Only for showing it: Oscar decides on the emails
 * as they're written (his saved readings are for exactly that text). null leaves it as it is.
 */
export function withName(text: string, name: string | null): string {
  if (name === null || !text) return text;
  const full = name.trim();
  const first = firstName(full);
  return text
    .replace(/\bAnika Ahluwalia\b/g, () => full || "You")
    .replace(/, Anika\b/g, () => (first ? `, ${first}` : ""))
    .replace(/\bAnika\b/g, () => first || "there");
}
