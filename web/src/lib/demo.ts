// Bringing in email. Until Gmail is connected, the inbox is the example emails in emails/ (the demo
// inbox); after that, it's checking your real inbox.

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
const BUSY_WAIT = 3000; // ms between tries while he's already checking on his own
const BUSY_TRIES = 20; // about a minute, longer than a check takes

/** One check, waiting for his own check to finish first if one is running (the API says it's busy). */
async function syncWhenFree() {
  for (let tries = 1; ; tries++) {
    try {
      return await syncGmail();
    } catch (e) {
      const busy = e instanceof Error && /already checking/i.test(e.message);
      if (!busy || tries >= BUSY_TRIES) throw e;
      await new Promise((resolve) => setTimeout(resolve, BUSY_WAIT));
    }
  }
}

/** Check now, and what opening or refreshing the app does (use-oscar.tsx). */
export async function checkGmail() {
  if (checking) return; // a second click while the first check is running does nothing
  checking = true;
  oscarSays("On it! Checking your inbox...");
  try {
    const { new: count, skipped, done } = await syncWhenFree();
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
