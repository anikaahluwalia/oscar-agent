// The chat with Oscar. It lives here, not in a component, so it's still there
// after you go to another page and come back.

import { useSyncExternalStore } from "react";
import { sendChat, sendFeedback, type Proposal } from "@/lib/api";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";

export type ChatMessage = {
  from: "you" | "oscar";
  text: string;
  decisions?: string[];
  proposal?: Proposal; // a rule waiting for your yes or no
  answered?: "yes" | "no";
};
type ChatState = { messages: ChatMessage[]; busy: boolean };

const GREETING: ChatMessage = {
  from: "oscar",
  text: "Hi, I'm Oscar. Ask me what needs you, why I made a call, or teach me a rule.",
};

let state: ChatState = { messages: [GREETING], busy: false };
const listeners = new Set<() => void>();

function set(next: Partial<ChatState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChat() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export async function askOscar(text: string, decisionId?: string) {
  if (state.busy) return;
  // What was said before, so Oscar can follow the conversation (not the greeting).
  const before = state.messages.slice(1).map((m) => ({ role: m.from, text: m.text }));
  set({ busy: true, messages: [...state.messages, { from: "you", text }] });
  try {
    const reply = await sendChat(text, before, decisionId);
    set({
      messages: [
        ...state.messages,
        { from: "oscar", text: reply.reply, decisions: reply.decisions, proposal: reply.proposal ?? undefined },
      ],
    });
    notifyChanged(); // a rule may have changed what Oscar does
  } catch {
    set({ messages: [...state.messages, { from: "oscar", text: "I can't reach my API right now." }] });
  } finally {
    set({ busy: false });
  }
}

/** Your answer to a rule Oscar proposed. Yes sends it as ordinary feedback, so the safety floor still decides. */
export async function answerProposal(index: number, yes: boolean) {
  const message = state.messages[index];
  if (!message?.proposal || message.answered) return;
  const mark = (answered: "yes" | "no", extra?: ChatMessage) => {
    const messages = state.messages.map((m, i) => (i === index ? { ...m, answered } : m));
    set({ messages: extra ? [...messages, extra] : messages });
  };
  if (!yes) {
    mark("no", { from: "oscar", text: "Okay, I'll leave it as it is." });
    return;
  }
  try {
    const { reply } = await sendFeedback(message.proposal.decision_id, message.proposal.kind);
    mark("yes", { from: "oscar", text: reply });
    notifyChanged();
  } catch (e) {
    oscarSays(e instanceof Error ? e.message : "Something went wrong.");
  }
}
