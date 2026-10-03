// The demo inbox: until Gmail is connected, the inbox is the example emails in emails/.

import { disconnectGmail, loadDemoInbox, recheckGmail, resetDemo, syncGmail } from "@/lib/api";
import { notifyChanged, offerUndo, oscarSays } from "@/lib/use-oscar";

export async function bringInDemo() {
  try {
    const decisions = await loadDemoInbox();
    notifyChanged();
    oscarSays("New emails are in, and I've sorted them!");
    offerUndo(decisions);
  } catch {
    oscarSays("I can't reach my API right now.");
  }
}

export async function startOver() {
  try {
    await resetDemo();
    notifyChanged();
    oscarSays("Fresh start! I've forgotten everything.");
  } catch {
    oscarSays("I can't reach my API right now.");
  }
}

// --- The real inbox ---------------------------------------------------------

let checking = false;

export async function checkGmail() {
  if (checking) return; // a second click while the first check is running does nothing
  checking = true;
  oscarSays("On it! Checking your inbox...");
  try {
    const { new: count, skipped, done } = await syncGmail();
    notifyChanged();
    const read = !count
      ? "Nothing new in your inbox. All quiet!"
      : done
        ? `I read ${count} new ${count === 1 ? "email" : "emails"} and took care of ${done}! You can undo any of them.`
        : `I read ${count} new ${count === 1 ? "email" : "emails"}! I didn't change anything in Gmail.`;
    oscarSays(skipped ? `${read} I couldn't open ${skipped}; I'll try again next time.` : read);
  } catch (e) {
    oscarSays(e instanceof Error ? e.message : "I can't reach my API right now.");
  } finally {
    checking = false;
  }
}

export async function recheckRecent() {
  if (checking) return;
  checking = true;
  oscarSays("On it! Re-reading your recent emails...");
  try {
    const { new: count } = await recheckGmail();
    notifyChanged();
    oscarSays(count ? `Done! I re-read ${count} ${count === 1 ? "email" : "emails"} with what I know now.` : "Those are already up to date!");
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
    oscarSays("Disconnected! I've kept my decisions and your reviews.");
  } catch {
    oscarSays("I can't reach my API right now.");
  }
}
