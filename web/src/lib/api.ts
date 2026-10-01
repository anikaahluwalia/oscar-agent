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
  | "ALWAYS_ASK_ME"
  | "SEEN";

/** How you score one of Oscar's decisions on a real inbox (oscar/review.py). Evaluation only; Oscar doesn't learn from it. */
export type ReviewLabel =
  | "CORRECT"
  | "QUESTIONED_TOO_MUCH"
  | "NEEDED_TO_ASK"
  | "MISINTERPRETED_RISK"
  | "UNNECESSARY_FLAGGING"
  | "INCORRECT_ACTION"
  | "INCORRECT_TYPE"
  | "SKIP";

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
  steps: string[];
  /** "gmail" is a real inbox. Oscar only reads it for now, so the decision is what he would do. */
  source: "demo" | "gmail";
  gmail: GmailInfo | null;
  policy_version: string | null;
}

export interface GmailInfo {
  message_id: string;
  thread_id: string;
  received_at: string | null;
  labels: string[];
  category: string | null;
  thread_length: number;
  emailed_before: boolean | null;
}

export interface Review {
  id: string;
  reviewed_at: string;
  decision_id: string;
  label: ReviewLabel;
  should_be_level: Level | null;
  should_be_action: Action | null;
  actual_type: string | null;
  note: string | null;
}

export type ReviewInput = Omit<Review, "id" | "reviewed_at">;

export interface ReviewTally {
  decisions: number;
  reviewed: number;
  scored: number;
  agreement: number | null;
  labels: Record<ReviewLabel, number>;
}

export interface ReviewSummary extends ReviewTally {
  by_version: Record<string, ReviewTally>;
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  address: string | null;
  connected_at: number | null;
  last_sync: number | null;
  read_only: boolean;
}

export interface ChatReply {
  reply: string;
  decisions: string[];
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
  review: Review | null;
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

export const getGmailStatus = () => call<GmailStatus>("/gmail");
/** A link, not a fetch: it takes you to Google and back. */
export const gmailConnectUrl = `${API}/auth/google/start`;
export const syncGmail = () => call<{ new: number; skipped: number }>("/gmail/sync", { method: "POST" });
export const disconnectGmail = () => call<{ ok: boolean }>("/gmail/disconnect", { method: "POST" });
export const getReviewSummary = () => call<ReviewSummary>("/reviews/summary");
export const sendReview = (review: ReviewInput) => call<Review>("/reviews", { method: "POST", body: JSON.stringify(review) });

export const sendChat = (message: string, decisionId?: string) =>
  call<ChatReply>("/chat", {
    method: "POST",
    body: JSON.stringify({ message, decision_id: decisionId ?? null }),
  });

export const sendFeedback = (decisionId: string, kind: FeedbackKind, editedText?: string) =>
  call<{ event: FeedbackEvent; reply: string }>("/feedback", {
    method: "POST",
    body: JSON.stringify({ decision_id: decisionId, kind, edited_text: editedText ?? null }),
  });
