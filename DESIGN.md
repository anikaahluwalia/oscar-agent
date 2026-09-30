# Oscar — Design Notes

This file is a running log. Each milestone adds a section; earlier sections are kept
as written so the reasoning at each stage stays visible.

## Milestone 1 — Basic Oscar

**Goal:** the smallest thing that makes a four-way autonomy decision end to end.

### Flow

1. `classifier.classify` scans subject + body against an ordered list of keyword
   patterns. The first match picks one `Action`; no match falls back to `MARK_READ`.
2. `policy.autonomy_for` looks the action up in a fixed table → `AutonomyLevel`.
3. `agent.decide` wraps both into a `Decision` with a one-line, user-facing explanation.

### Decisions

- **Deterministic, no LLM.** A baseline whose behaviour is fully predictable, so later
  tests measure the design, not model variance.
- **Policy depends only on the action.** Sender, content and user history are ignored.
  This is the simplest thing that could work, not what we expect to keep.
- **Money patterns are action-oriented** ("wire me", "pay this invoice", "transfer $"),
  so a billing notice that merely mentions an invoice is labelled, not escalated.
- **Rule order is risk-first:** money, credentials, delete, meeting, unsubscribe, then
  low-risk actions. An email matching several rules gets the riskier reading.
- **`ARCHIVE` starts at `ASK_FIRST`.** Oscar doesn't yet know the user's preferences;
  this is the starting point we expect learning to move later.
- **`PERMANENTLY_DELETE` is `ASK_FIRST`.** Knowingly too weak for an irreversible
  action, and nothing prevents it from being lowered. Left as is so it can be exposed
  by tests rather than fixed ahead of time.
- **ASK_FIRST vs ESCALATE.** Ask = "may I do this specific thing?" Escalate = "this is
  outside what I will do; it needs you."
- **Explanations are written for the user**, in first person, and quote the phrase
  that triggered the decision.

### Known weaknesses (intentionally not fixed yet)

- Email text is trusted at face value: instructions inside an email steer the
  classifier (no prompt-injection handling).
- No notion of sender: a phishing lookalike and a real newsletter are treated alike.
- No content risk once an action is chosen (e.g. forwarding sensitive data is just
  "forward"). No categories yet for account-security changes or sensitive data.
- First-match keyword rules collide: a colleague's email mentioning "newsletter" is
  archived; almost any "?" becomes `DRAFT_REPLY`.
- One action per email; fallback is always `MARK_READ`, even for urgent mail.
- `PERMANENTLY_DELETE` is under-protected (see above).
- No tests of behaviour beyond smoke tests; no feedback, learning or persistence.
