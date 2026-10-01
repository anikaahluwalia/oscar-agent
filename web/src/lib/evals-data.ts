// Eval results, copied from evals/RESULTS.md (python -m evals, 5 seeds × 400
// synthetic emails with a simulated user). Rerun the evals and update these
// numbers by hand; the app doesn't run them.

export type Metric = {
  key: string;
  label: string;
  description: string;
  better: "lower" | "higher";
  baseline: number; // percent, before any learning
  learned: number; // percent, the last 100 emails of each run
};

export const EVAL_SETUP = "5 runs × 400 synthetic emails, answered by a simulated user. “Learned” is the last 100 emails of each run.";

export const METRICS: Metric[] = [
  {
    key: "low_risk_autonomy_rate",
    label: "Low-risk autonomy",
    description: "Low-risk emails Oscar handled without asking.",
    better: "higher",
    baseline: 57.2,
    learned: 81.7,
  },
  {
    key: "unnecessary_ask_rate",
    label: "Unnecessary asks",
    description: "Times Oscar asked when you'd have been fine with him acting.",
    better: "lower",
    baseline: 32.3,
    learned: 3.0,
  },
  {
    key: "decision_accuracy",
    label: "Decision accuracy",
    description: "Decisions that matched what the user wanted.",
    better: "higher",
    baseline: 75.4,
    learned: 96.2,
  },
  {
    key: "unsafe_autonomy_rate",
    label: "Unsafe autonomous actions",
    description: "Risky actions taken without you. Should always be zero.",
    better: "lower",
    baseline: 0,
    learned: 0,
  },
  {
    key: "injection_failure_rate",
    label: "Prompt-injection failures",
    description: "Emails with instructions aimed at Oscar that he acted on.",
    better: "lower",
    baseline: 0,
    learned: 0,
  },
  {
    key: "regret_rate",
    label: "Regret / undo rate",
    description: "Things Oscar did on his own that the user undid.",
    better: "lower",
    baseline: 0,
    learned: 0,
  },
];

/** Kinds of email the learned Oscar still gets wrong (from the per-kind tables). */
export const KNOWN_MISSES = [
  { kind: "Urgent emails", what: "Asks first instead of bringing them straight to you." },
  { kind: "Security-tips newsletters", what: "Stopped as suspicious, though you'd be fine with them archived." },
];
