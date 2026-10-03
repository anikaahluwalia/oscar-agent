import type { OscarPose } from "@/components/oscar-mood";
import type { DecisionWithFeedback } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat-store";

// What chat-store says when you turn a rule down.
const SAID_NO = "Okay, I'll leave it as it is.";

/** Oscar's pose for one of his messages, from what the message really is. */
export function moodOf(messages: ChatMessage[], index: number, items: DecisionWithFeedback[]): OscarPose {
  const m = messages[index];
  const before = messages[index - 1];
  if (index === 0) return "reporting"; // the greeting
  if (m.proposal) return "learning";
  const stopped = m.decisions?.some((id) => items.find((i) => i.decision.id === id)?.decision.autonomy_level === "ESCALATE");
  if (stopped) return "guarding";
  // Two of his messages in a row: the second is his answer to your yes or no on a rule.
  if (before?.from === "oscar") {
    const saidYes = messages.some((x) => x.answered === "yes");
    return saidYes && m.text !== SAID_NO ? "proud" : "done";
  }
  // The model failed and the basic chat answered, or the API couldn't be reached (no decisions at all).
  if (m.problem || m.decisions === undefined) return "thinking";
  return "done";
}
