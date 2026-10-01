// Types and calls for the Oscar API (oscar/api.py).

export type Level = "PROCEED_SILENTLY" | "PROCEED_AND_NOTIFY" | "ASK_FIRST" | "ESCALATE";

export type Action =
  | "MARK_READ"
  | "ARCHIVE"
  | "APPLY_LABEL"
  | "DRAFT_REPLY"
  | "SEND_REPLY"
  | "FORWARD"
  | "UNSUBSCRIBE"
  | "ACCEPT_MEETING"
  | "PERMANENTLY_DELETE"
  | "SEND_CREDENTIALS"
  | "MOVE_MONEY";

export type FeedbackKind =
  | "APPROVE"
  | "REJECT"
  | "UNDO"
  | "EDIT_THEN_SEND"
  | "ALWAYS_DO_THIS"
  | "ALWAYS_ASK_ME";

export interface Decision {
  id: string;
  created_at: string;
  email_id: string;
  sender: string;
  subject: string;
  snippet: string;
  action: Action;
  autonomy_level: Level;
  matched_pattern: string | null;
  explanation: string;
  message: string;
  noticed: string | null;
  safety_flags: string[];
  learned: boolean;
  level_source: "policy" | "guess" | "learned" | "floor" | "safety_check";
}

export interface FeedbackEvent {
  id: string;
  created_at: string;
  decision_id: string;
  kind: FeedbackKind;
  action: Action;
  autonomy_level: Level;
  sender: string;
  edited_text: string | null;
  blocked_by_floor: boolean;
}

export interface DecisionWithFeedback {
  decision: Decision;
  feedback: FeedbackEvent[];
}

export interface LearnedRow {
  sender: string;
  action: Action;
  yes: number;
  no: number;
  mean: number;
  always_ask: boolean;
  level: Level | null;
  reason: string;
  sentence: string;
}

export interface Brief {
  handled: number;
  told: number;
  waiting: number;
  for_you: number;
  summary: string;
  trend: string | null;
  learned: string | null;
}

export interface AutonomyRow {
  sender: string;
  action: Action;
  level: Level;
  reason: string;
  floor: Level | null;
  floor_reason: string | null;
  ceiling: Level | null;
  decision_id: string;
}

const API = process.env.NEXT_PUBLIC_OSCAR_API ?? "http://localhost:8000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    // FastAPI puts the reason in "detail". For feedback errors it's Oscar's own words.
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${response.status})`);
  }
  return response.json();
}

export const getDecisions = () => call<DecisionWithFeedback[]>("/decisions");
export const getLearned = () => call<LearnedRow[]>("/learned");
export const getBrief = () => call<Brief>("/brief");
export const getAutonomy = () => call<AutonomyRow[]>("/autonomy");
export const loadDemoInbox = () => call<Decision[]>("/demo/inbox", { method: "POST" });
export const resetDemo = () => call<{ ok: boolean }>("/demo/reset", { method: "POST" });

export const sendFeedback = (decisionId: string, kind: FeedbackKind, editedText?: string) =>
  call<{ event: FeedbackEvent; reply: string }>("/feedback", {
    method: "POST",
    body: JSON.stringify({ decision_id: decisionId, kind, edited_text: editedText ?? null }),
  });
