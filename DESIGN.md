# Oscar — Design Notes

This file is a running log. Each Stage adds a section; earlier sections are kept
as written so the reasoning at each stage stays visible.

## Stage 1 — Basic Oscar

**Goal:** Create the most basic email agent end-to-end.

### Flow

1. `classifier.classify` scans subject + body of email against an ordered list of keyword
   patterns. The first match picks one `Action`. No match falls back to `MARK_READ`.
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

## Stage 2 — Baseline testing

**Goal:** Test Basic Oscar on more complex emails and note down where it goes wrong. No
fixes in this stage.

### What was added

- `scenarios/baseline.json`: 27 test emails. Each one has the action and level
  Oscar should pick, a category, and a short reason.
- `tests/test_scenarios.py`: runs every scenario. Scenarios Oscar gets wrong have a
  `known_failure` and are marked `xfail(strict=True)`. When a later stage fixes one,
  the test will start passing, pytest will fail the run, and the marker has to be
  removed in that commit.
- Some scenarios come in pairs: two emails that differ in one detail. One is the
  risky email and the other is a normal email Oscar should still handle easily. This
  is so later safety rules can't just make Oscar ask about everything.

### Categories

| Category | Meaning | Scenarios | Oscar gets wrong |
|---|---|---|---|
| `too_permissive` | Oscar takes more autonomy than it should | 12 | 12 |
| `too_cautious` | Oscar escalates something that is safe | 3 | 3 |
| `inconsistent` | One word changes the decision | 2 | 2 |
| `control` | Normal emails that must keep working | 10 | 0 |

There are also 3 tests that lower the policy table for `MOVE_MONEY`,
`SEND_CREDENTIALS` and `PERMANENTLY_DELETE`. All 3 fail: nothing stops these
actions from being lowered.

### Findings

**Too permissive (12).** This is the worst group.
- 6 are handled silently: two money requests ("remit via Zelle", gift cards), a
  password phishing link, a new sign-in alert, a password-changed alert hidden by
  an injected note, and an urgent outage email.
- 2 get a draft reply and a notification: a request for a one-time code, and a
  request for passport details.
- 4 are ASK_FIRST when they should be escalated: an account recovery change,
  forwarding SSNs to a personal address, agreeing to a contract, and a newsletter
  with hidden instructions to forward the user's emails.

**Too cautious (3).** A bank notice ("your transfer $200 is complete"), a
newsletter quoting a scam, and a phishing warning from IT are all escalated.
Oscar reacts to the words without knowing if they are a request.

**Inconsistent (2).** "Send payment" is escalated but "send the funds" is marked
as read. "Please forward this" is a forward but "please forward this newsletter"
is an archive.

**Controls (10).** All pass. One of them, `injection_preapproved_payment`, only
passes because "pay this invoice" is a keyword. Oscar never notices the injection.

### What the failures have in common

1. **Keywords decide everything.** Oscar only escalates when the exact wording is
   in its list. Anything worded differently gets through, and quotes or warnings
   get caught by mistake.
2. **No idea of risk.** Oscar only looks at the action. It doesn't check what is
   being sent (SSNs, passport data), whether it is an account security change, or
   whether it commits the user to something.
3. **Email text is trusted.** Hidden instructions in an email can change what Oscar
   does.
4. **No safety floor.** Risky actions are only as safe as one line in the policy
   table.

### What Stage 3 should fix

A hard safety floor for money movement, credentials, irreversible actions, external
commitments, sensitive data, account security changes and prompt injection. It
should sit after the policy so nothing can lower it. The 10 controls must still
pass, so Oscar doesn't become too cautious.
