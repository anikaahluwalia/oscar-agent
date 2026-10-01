// The demo inbox: until Gmail is connected, the inbox is the example emails in emails/.

import { disconnectGmail, loadDemoInbox, resetDemo, syncGmail } from "@/lib/api";
import { notifyChanged, offerUndo, oscarSays } from "@/lib/use-oscar";

export async function bringInDemo() {
  try {
    const decisions = await loadDemoInbox();
    notifyChanged();
    oscarSays("New emails are in. I've sorted them.");
    offerUndo(decisions);
  } catch {
    oscarSays("I can't reach my API right now.");
  }
}

export async function startOver() {
  try {
    await resetDemo();
    notifyChanged();
    oscarSays("Fresh start. I've forgotten everything.");
  } catch {
    oscarSays("I can't reach my API right now.");
  }
}

// --- The real inbox ---------------------------------------------------------

let checking = false;

export async function checkGmail() {
  if (checking) return; // a second click while the first check is running does nothing
  checking = true;
  oscarSays("Checking your inbox...");
  try {
    const { new: count, skipped } = await syncGmail();
    notifyChanged();
    const read = count ? `I read ${count} new ${count === 1 ? "email" : "emails"}. Nothing was changed in Gmail.` : "Nothing new in your inbox.";
    oscarSays(skipped ? `${read} I couldn't open ${skipped}; I'll try again next time.` : read);
  } catch (e) {
    oscarSays(e instanceof Error ? e.message : "I can't reach my API right now.");
  } finally {
    checking = false;
  }
}

export async function disconnectGmailAccount() {
  try {
    await disconnectGmail();
    notifyChanged();
    oscarSays("Disconnected. I've kept my decisions and your reviews.");
  } catch {
    oscarSays("I can't reach my API right now.");
  }
}
