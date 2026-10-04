// Types and calls for the Oscar API (oscar/api.py).

import { readSetting, writeSetting } from "@/lib/local-setting";

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
  | "SEEN"
  | "FORGET"
  // How much he should do on his own with emails like this one. Approving never says that.
  | "JUST_HANDLE_IT"
  | "HANDLE_AND_TELL_ME"
  | "KEEP_ASKING";

/** A rule about one sender, or about every email like this one (archive, mark read and label only). */
export type RuleScope = "sender" | "kind";

/** How you score one of Oscar's decisions on a real inbox (oscar/review.py). It grades him, and teaches him (lessons()). */
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
  level_source: "policy" | "guess" | "learned" | "floor" | "safety_check" | "caution" | "model_check";
  understood_by: "rules" | "model" | null; // Stage 11: who worked out what the email is (null: a guess)
  acting?: boolean; // Stage 12: made while Oscar could act in Gmail; before that, only what he would do
  summary: string; // the model's one line on what the email is, when it read it
  steps: string[];
  /** "gmail" is your real inbox, "demo" the example emails. On Gmail, `acting` says whether he could act when he decided. */
  source: "demo" | "gmail";
  gmail: GmailInfo | null;
  policy_version: string | null;
  email_type?: string; // what kind of email Oscar thinks it is
  confidence?: number; // how sure he is that the level is right
  factors?: string[]; // a few plain words on what mattered for this call
  safety_floor?: Level | null; // the least involvement the safety rules allow here
  safety_rule?: string | null; // the safety rule or check that set the level, if one did
  preference?: { scope: "sender" | "domain" | "kind"; evidence: number; confidence: number } | null; // what he learned from you that he used
  reminder?: Reminder | null; // an event or due date the email mentions
  type_from_you?: boolean; // the kind of email came from what you said this sender's emails are
}

/** Something coming up that an email mentions (oscar/reminders.py). */
export interface Reminder {
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  kind: "event" | "due";
  detail: string;
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

export type GradeError = "none" | "too_cautious" | "too_permissive" | "wrong_action";

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
  can_draft?: boolean; // there's a model key, so he can write reply drafts
  rethinking?: boolean; // redoing his calls on recent emails after something you taught him
  configured: boolean;
  connected: boolean;
  address: string | null;
  name: string | null; // from your Google account, when it was shared
  picture: string | null; // your Google photo
  connected_at: number | null;
  last_sync: number | null;
  auto_check_minutes: number; // 0 means Oscar only checks when you ask
  can_act: boolean; // Stage 12: the connection allows changing labels
  acting: boolean; // Oscar acts in Gmail
  read_only: boolean;
  demo?: boolean; // this browser is in demo mode: a simulated inbox, and Gmail isn't used at all
}

/** Something Oscar did in Gmail (Stage 12): the labels it added and removed, and whether it was undone. */
export interface ActionDone {
  id: string;
  action: Action;
  by: "oscar" | "you";
  added: string[];
  removed: string[];
  done_at: string;
  undone_at: string | null;
  draft_id?: string | null; // a reply he saved as a Gmail draft (never sent)
  draft_text?: string | null; // and what it says
}

/** A rule Oscar suggests in the chat. Nothing changes until you say yes. */
export interface Proposal {
  decision_id: string;
  kind: FeedbackKind;
  text: string;
  scope?: RuleScope;
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
  scope?: RuleScope; // a rule about this sender, or every email like this one
  desired_level?: Level | null;
}

export interface DecisionWithFeedback {
  decision: Decision;
  feedback: FeedbackEvent[];
  review: Review | null;
  done: ActionDone | null; // Stage 12: what Oscar did in Gmail for it
  classification?: ClassificationFeedback | null; // your latest word on what kind of email it is
  label?: string | null; // for "Label it": the Gmail label he used or would use, by its name in Settings
  safety_review?: SafetyReview | null; // your answer, when a safety rule stopped it
  gone?: boolean; // you deleted the email in Gmail, so the lists leave it out
  // Real inbox: what you said he should have done, and how this decision does against it.
  answer: {
    level: Level;
    action: Action | null;
    error: GradeError;
    from_earlier: boolean; // your answer was given on an earlier read of this email
    earlier_error: GradeError | null; // how that earlier read did against it
  } | null;
}

/** You said an email is a different kind than Oscar took it for (oscar/classification.py). */
export interface ClassificationFeedback {
  id: string;
  created_at: string;
  decision_id: string;
  email_id: string;
  sender: string;
  original_type: string;
  corrected_type: string;
}

/** Whether Oscar read the risk right on an email a safety rule stopped (oscar/safety_review.py). */
export interface SafetyReview {
  id: string;
  reviewed_at: string;
  decision_id: string;
  verdict: "RISK_CORRECT" | "MISCLASSIFIED";
  flags: string[];
  safety_rule: string | null;
  corrected_type: string | null;
  note: string | null;
}

/** One of your own categories for senders. Oscar's decisions never look at these. */
export interface Category {
  id: string;
  name: string;
  created_at: string;
  senders: string[]; // addresses, lowercased
}

/** How much a pattern rests on, in words: a rule you set, or how strong your answers are. */
export type PatternStatus = "rule" | "strong" | "moderate" | "learning";

/** Your rule for a kind of email, or what your answers about many senders add up to (GET /patterns). */
export interface PatternRow {
  scope: "kind" | "domain";
  name: string; // the kind of email (a family, like bulk_mail) or the domain
  kind: string;
  action: Action;
  senders: number;
  evidence: number;
  confidence: number;
  acting_share: number;
  desired: Level;
  rule: Level | "ask" | null;
  level: Level | null; // null while still learning
  reason: string;
  status: PatternStatus;
  updated_at: string | null;
  decision_id: string | null; // the email the rule was set on
  example_id: string | null; // the newest email like it, to set a rule on
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
  told?: Level | null; // a level you set for this sender ("for emails like this")
  updated_at?: string | null; // when you last taught him about it
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

// --- Demo mode ----------------------------------------------------------------
// Trying Oscar without Gmail. Each browser gets its own simulated inbox on the API, kept in memory
// and never mixed with a real one: while in the demo, every call says which one (X-Oscar-Demo).
// The mode is "demo" or "gmail" once you've picked on the front page, and unset before that.

const DEMO_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** This browser's demo inbox, while it's in demo mode. Null on the real inbox (and on the server). */
export function demoSession(): string | null {
  const id = readSetting("demo-session");
  return readSetting("mode") === "demo" && id && DEMO_ID.test(id) ? id : null;
}

export const isDemo = () => demoSession() !== null;

/** Start a new demo inbox in this browser. Each one starts fresh. */
export function enterDemo(): string {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  writeSetting("demo-session", id);
  writeSetting("mode", "demo");
  return id;
}

/** Back to the front page: forget the demo inbox, and the choice. */
export function leaveDemo() {
  writeSetting("demo-session", null);
  writeSetting("mode", null);
}

/** You picked your real inbox. */
export function chooseGmail() {
  leaveDemo();
  writeSetting("mode", "gmail");
}

async function call<T>(path: string, init?: RequestInit, demo = demoSession()): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(demo ? { "X-Oscar-Demo": demo } : {}), ...init?.headers },
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

/** What Oscar may do on his own with each kind of email, from the rules (GET /permissions). */
export interface PermissionRow {
  action: Action;
  email_type: string;
  level: Level;
  reason: string;
  floor: Level | null;
  ceiling: Level | null;
  /** What your answers, or your "emails like this" rule, say for a new sender of this kind. */
  learned: { level: Level; reason: string; senders: number; rule: boolean; decision_id: string | null; updated_at: string | null } | null;
}
export const getPermissions = () => call<PermissionRow[]>("/permissions");
export const getPatterns = () => call<PatternRow[]>("/patterns");


/** How Oscar shows up in Gmail, read by the extension too (oscar/app_settings.py). */
export interface AppSettings {
  companion: { show: boolean; position: "right" | "left"; animate: boolean };
  notify: { approvals: boolean; safety: boolean; handled: boolean };
  labels: Record<LabelRole, string>; // what each of his Gmail labels is called (oscar/labels.py)
}
export type LabelRole = "stopped" | "needs_you" | "fyi" | "receipts" | "sorted";
/** Rename one of his Gmail labels. It's renamed in Gmail too when he can change labels there. */
export const renameLabel = (role: LabelRole, name: string) =>
  call<{ settings: AppSettings; reply: string }>("/labels/rename", { method: "POST", body: JSON.stringify({ role, name }) });
export const getAppSettings = () => call<AppSettings>("/app-settings");
export const saveAppSettings = (changes: { companion?: Partial<AppSettings["companion"]>; notify?: Partial<AppSettings["notify"]> }) =>
  call<AppSettings>("/app-settings", { method: "POST", body: JSON.stringify(changes) });

/** One habit Oscar found in your last six months (oscar/cold_start.py candidates). */
export interface Habit {
  id: string;
  kind: string; // a family of email, like bulk_mail
  habit: "archived" | "ignored" | "read" | "kept";
  action: Action;
  emails: number; // how many emails like this he looked at
  count: number; // how many of them you handled this way
  senders: number;
  read: number;
  share: number;
  options: HabitChoice[];
  suggested: HabitChoice; // the answer that fits your history best; nothing is chosen for you
  examples: string[]; // a few of the senders, newest first
  label_name?: string; // the Gmail label "Label them" would use, as it's called in Settings
}
export type HabitChoice = "handle" | "tell" | "label" | "ask" | "reject";

/** How the look back over your last six months is going (GET /cold-start). */
export interface ColdStart {
  state: "unavailable" | "not_started" | "running" | "ready" | "complete" | "skipped" | "failed";
  phase: "fetching" | "understanding" | "finding" | "ready" | null;
  discovered: number;
  processed: number;
  candidates: Habit[];
  answers: Record<string, HabitChoice>;
  error: string | null;
  new_account?: boolean;
}
export const getColdStart = () => call<ColdStart>("/cold-start");
export const startColdStart = () => call<ColdStart>("/cold-start/start", { method: "POST", body: "{}" });
export const skipColdStart = () => call<ColdStart>("/cold-start/skip", { method: "POST", body: "{}" });
export const finishColdStart = () => call<ColdStart>("/cold-start/done", { method: "POST", body: "{}" });
export const answerHabit = (patternId: string, choice: HabitChoice) =>
  call<ColdStart>("/cold-start/answer", { method: "POST", body: JSON.stringify({ pattern_id: patternId, choice }) });

/** Clearing what Oscar learned on this inbox, and bringing it back. Nothing is deleted. */
export const getLearning = () => call<{ cleared_at: string | null }>("/learning");
export const clearLearning = () => call<{ cleared_at: string; reply: string }>("/learning/clear", { method: "POST", body: "{}" });
export const restoreLearning = () => call<{ cleared_at: null; reply: string }>("/learning/restore", { method: "POST", body: "{}" });
/** A link, not a fetch: the browser saves the file. */
export const exportUrl = `${API}/export`;

/** Every kind of email you can say one is (oscar/classification.py EMAIL_TYPES). */
export const getEmailTypes = () => call<{ type: string; risky: boolean }[]>("/email-types");
export const sendClassification = (decisionId: string, emailType: string) =>
  call<ClassificationFeedback>("/classifications", { method: "POST", body: JSON.stringify({ decision_id: decisionId, email_type: emailType }) });
export const sendSafetyReview = (decisionId: string, verdict: SafetyReview["verdict"], correctedType?: string | null, note?: string | null) =>
  call<SafetyReview>("/safety-reviews", {
    method: "POST",
    body: JSON.stringify({ decision_id: decisionId, verdict, corrected_type: correctedType ?? null, note: note ?? null }),
  });

export const getCategories = () => call<Category[]>("/categories");
export const createCategory = (name: string) => call<Category>("/categories", { method: "POST", body: JSON.stringify({ name }) });
export const renameCategory = (id: string, name: string) =>
  call<Category>(`/categories/${encodeURIComponent(id)}/rename`, { method: "POST", body: JSON.stringify({ name }) });
export const deleteCategory = (id: string) => call<{ ok: boolean }>(`/categories/${encodeURIComponent(id)}/delete`, { method: "POST", body: "{}" });
export const assignCategory = (sender: string, categoryId: string | null) =>
  call<{ ok: boolean }>("/categories/assign", { method: "POST", body: JSON.stringify({ sender, category_id: categoryId }) });
export const loadDemoInbox = () => call<Decision[]>("/demo/inbox", { method: "POST" });
/** In demo mode, starts this browser's demo inbox again (like startDemo); otherwise the shared example inbox. */
export const resetDemo = () => call<unknown>("/demo/reset", { method: "POST" });
/** Demo mode: a fresh demo inbox, with its first emails decided as if they just arrived. */
export const startDemo = () => call<Decision[]>("/demo/start", { method: "POST" });
/** Demo mode's Check now: the emails that come in later, decided with what he's learned so far. */
export const checkDemo = () => call<{ new: number; skipped: number; done: number }>("/demo/check", { method: "POST" });

export const getGmailStatus = () => call<GmailStatus>("/gmail");
/** Your real Gmail connection, even while this browser is in the demo (the front page asks this). */
export const getRealGmailStatus = () => call<GmailStatus>("/gmail", undefined, null);
/** A link, not a fetch: it takes you to Google and back. */
export const gmailConnectUrl = `${API}/auth/google/start`;
/** Connect again, this time with permission to change labels (Stage 12). */
export const gmailActUrl = `${API}/auth/google/start?act=true`;
export const setActing = (on: boolean) => call<{ acting: boolean }>("/gmail/acting", { method: "POST", body: JSON.stringify({ on }) });
export const syncGmail = () => call<{ new: number; skipped: number; done: number }>("/gmail/sync", { method: "POST" });
export const recheckGmail = () => call<{ new: number; skipped: number }>("/gmail/recheck", { method: "POST" });
export const disconnectGmail = () => call<{ ok: boolean }>("/gmail/disconnect", { method: "POST" });
/** An email's image, fetched by Oscar (GET /email-image) so the sender never sees your address or browser. */
export const imageThroughOscar = (url: string) => `${API}/email-image?url=${encodeURIComponent(url)}`;
export const API_ORIGIN = new URL(API).origin;
/** The whole real email, fetched from Gmail when you open it. Nothing is saved. */
export const getEmailContent = (decisionId: string) =>
  call<{ html: string | null; text: string }>(`/emails/${encodeURIComponent(decisionId)}/content`);
/** A saved eval run (evals/results/runs). The test note on Promises comes from one of these. */
export interface EvalRun {
  run_id: string;
  created_at: string;
  suite: "heldout" | "safety" | "regression";
  dataset: { name: string; cases: number; sha256: string };
  versions: { commit: string; classifier: string; policy: { name: string }; understanding?: { model: string; prompt: string; mode: string } | null };
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
export const getChatStatus = () => call<{ model: string | null }>("/chat/status");

/** desiredLevel: for a rule about every email like this one, how much he does on his own (quietly or with a heads up). */
export const sendFeedback = (decisionId: string, kind: FeedbackKind, editedText?: string, scope: RuleScope = "sender", desiredLevel?: Level) =>
  call<{ event: FeedbackEvent; reply: string }>("/feedback", {
    method: "POST",
    body: JSON.stringify({ decision_id: decisionId, kind, edited_text: editedText ?? null, scope, desired_level: desiredLevel ?? null }),
  });
