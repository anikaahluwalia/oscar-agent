// The demo inbox: until Gmail is connected, the inbox is the example emails in emails/.

import { loadDemoInbox, resetDemo } from "@/lib/api";
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
