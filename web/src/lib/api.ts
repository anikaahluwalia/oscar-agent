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
  | "OTHER"
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
  level_source: "policy" | "guess" | "learned" | "floor" | "safety_check" | "caution";
  steps: string[];
  /** "gmail" is a real inbox. Oscar only reads it for now, so the decision is what he would do. */
  source: "demo" | "gmail";
  gmail: GmailInfo | null;
  policy_version: string | null;
  email_type?: string; // what kind of email Oscar thinks it is
  confidence?: number; // how sure he is that the level is right
}

export interface GmailInfo {
  message_id: string;
  thread_id: string;
  received_at: string | null;
  labels: string[];
  category: string | null;
  thread_length: number;
  emailed_before: boolean | null;
  preview?: string; // Gmail's own one-line preview (emails read before it was saved don't have one)
}

export type Why = "preference" | "misread" | "risk";
export type Reason =
  | "SCAM"
  | "MONEY"
  | "CREDENTIALS"
  | "ACCOUNT_SECURITY"
  | "SENSITIVE_DATA"
  | "COMMITMENT"
  | "PROMPT_INJECTION"
  | "IMPORTANT";

export interface Review {
  id: string;
  reviewed_at: string;
  decision_id: string;
  label: ReviewLabel;
  should_be_level: Level | null;
  should_be_action: Action | null;
  actual_type: string | null;
  note: string | null;
  complete: boolean; // has the full answer (what he should have done); older reviews don't
  why: Why | null;
  reasons: Reason[];
  label_name: string | null;
}

/** "Yes" or "Not sure" is a label alone. A "No" is what he should have done; the server works out the label. */
export type ReviewInput =
  | { decision_id: string; label: "CORRECT" | "SKIP" }
  | {
      decision_id: string;
      should_be_level: Level;
      should_be_action: Action | null;
      why: Why | null;
      reasons: Reason[];
      actual_type: string | null;
      label_name: string | null;
      note: string | null;
    };

export interface Rate {
  rate: number | null;
  of: number;
}

/** The eval measures for reviews with a full answer. Held back while old half-answers remain. */
export type Graded =
  | { n: number; held_back: true }
  | { n: 0 }
  | {
      n: number;
      passed: number;
      level_accuracy: Rate;
      action_accuracy: Rate;
      errors: { too_cautious: number; too_permissive: number; wrong_action: number };
      unnecessary_ask_rate: Rate;
      too_permissive_rate: Rate;
      acted_when_you_would_stop: number;
      risk_weighted_error: number;
      confusion: { levels: Level[]; counts: number[][] };
      why: Record<Why, number>;
    };

export interface ReviewTally {
  decisions: number;
  reviewed: number;
  scored: number;
  agreement: number | null;
  labels: Record<ReviewLabel, number>;
  old_way: number;
  graded: Graded;
}

export interface ReviewSummary extends ReviewTally {
  by_version: Record<string, ReviewTally>;
  rereads?: ReviewTally;
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  address: string | null;
  connected_at: number | null;
  last_sync: number | null;
  auto_check_minutes: number; // 0 means Oscar only checks when you ask
  read_only: boolean;
}

/** A rule Oscar suggests in the chat. Nothing changes until you say yes. */
export interface Proposal {
  decision_id: string;
  kind: FeedbackKind;
  text: string;
}

export interface ChatReply {
  reply: string;
  decisions: string[];
  proposal: Proposal | null;
  source: "model" | "basic"; // basic: the keyword chat answered (no model key, or the model failed)
  problem: string | null; // why the model didn't answer, when it should have
}

export type ChatTurn = { role: "you" | "oscar"; text: string };

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
  // Real inbox: what you said he should have done, and how this decision does against it.
  answer: { level: Level; action: Action | null; error: "none" | "too_cautious" | "too_permissive" | "wrong_action"; from_earlier: boolean } | null;
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
export const recheckGmail = () => call<{ new: number; skipped: number }>("/gmail/recheck", { method: "POST" });
export const disconnectGmail = () => call<{ ok: boolean }>("/gmail/disconnect", { method: "POST" });
/** The whole real email, fetched from Gmail when you open it. Nothing is saved. */
export const getEmailContent = (decisionId: string) =>
  call<{ html: string | null; text: string }>(`/emails/${encodeURIComponent(decisionId)}/content`);
/** A saved eval run (evals/results/runs). Every number on the Evals page comes from one of these. */
export interface EvalRun {
  run_id: string;
  created_at: string;
  suite: "heldout" | "safety" | "regression";
  dataset: { name: string; cases: number; sha256: string };
  versions: { commit: string; classifier: string; policy: { name: string } };
  learning: { set: string; emails: number; seed: number; feedback: number } | null;
  metrics: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  breakdowns: Record<string, Record<string, { cases: number; passed: number; autonomy_accuracy: number | null; action_correctness: number | null; unnecessary_ask_rate: number | null; critical_violations: number }>>;
  confusion: { levels: Level[]; counts: number[][] };
  calibration: { bucket: string; n: number; confidence: number | null; accuracy: number | null }[];
  cases?: EvalCaseResult[];
}

export interface EvalCaseResult {
  case_id: string;
  category: string;
  expected_level: Level;
  predicted_level: Level;
  expected_action: Action | null;
  predicted_action: Action;
  safety_expected: boolean;
  safety_detected: boolean;
  confidence: number;
  passed: boolean;
  error: "none" | "critical" | "too_permissive" | "too_cautious" | "wrong_action";
  level_source: string;
  email?: { sender: string; subject: string; body: string };
  rationale?: string;
}

export const getEvalRuns = () => call<EvalRun[]>("/evals/runs");
export const getEvalRun = (runId: string) => call<EvalRun>(`/evals/runs/${encodeURIComponent(runId)}`);
export const getReviewSummary = () => call<ReviewSummary>("/reviews/summary");
export const sendReview = (review: ReviewInput) => call<Review>("/reviews", { method: "POST", body: JSON.stringify(review) });

export const sendChat = (message: string, history: ChatTurn[], decisionId?: string) =>
  call<ChatReply>("/chat", {
    method: "POST",
    body: JSON.stringify({ message, history, decision_id: decisionId ?? null }),
  });
export type BulkAction = "MARK_READ" | "ARCHIVE" | null;
export const getInboxSettings = () => call<{ bulk_action: BulkAction }>("/inbox-settings");
export const setInboxSettings = (bulk_action: BulkAction) =>
  call<{ bulk_action: BulkAction }>("/inbox-settings", { method: "POST", body: JSON.stringify({ bulk_action }) });
export const getChatStatus = () => call<{ model: string | null }>("/chat/status");

export const sendFeedback = (decisionId: string, kind: FeedbackKind, editedText?: string) =>
  call<{ event: FeedbackEvent; reply: string }>("/feedback", {
    method: "POST",
    body: JSON.stringify({ decision_id: decisionId, kind, edited_text: editedText ?? null }),
  });
