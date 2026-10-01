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

export async function checkGmail() {
  try {
    const { new: count } = await syncGmail();
    notifyChanged();
    oscarSays(
      count
        ? `I read ${count} new ${count === 1 ? "email" : "emails"}. Nothing was changed in Gmail.`
        : "Nothing new in your inbox.",
    );
  } catch (e) {
    oscarSays(e instanceof Error ? e.message : "I can't reach my API right now.");
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
