// The chat with Oscar. It lives here, not in a component, so it's still there
// after you go to another page and come back.

import { useSyncExternalStore } from "react";
import { sendChat } from "@/lib/api";
import { notifyChanged } from "@/lib/use-oscar";

export type ChatMessage = { from: "you" | "oscar"; text: string; decisions?: string[] };
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
  set({ busy: true, messages: [...state.messages, { from: "you", text }] });
  try {
    const reply = await sendChat(text, decisionId);
    set({ messages: [...state.messages, { from: "oscar", text: reply.reply, decisions: reply.decisions }] });
    notifyChanged(); // a rule may have changed what Oscar does
  } catch {
    set({ messages: [...state.messages, { from: "oscar", text: "I can't reach my API right now." }] });
  } finally {
    set({ busy: false });
  }
}
