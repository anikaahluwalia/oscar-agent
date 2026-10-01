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

## Stage 3 — Hard safety floor

**Goal:** Make sure risky emails can't be handled without the user, and that
nothing (the policy table now, learning later) can change that.

### How it works

The safety code is in `oscar/safety.py` and runs after the policy table.

1. **Action floors.** Each risky action has a lowest allowed level. `MOVE_MONEY`
   and `SEND_CREDENTIALS` are always `ESCALATE`. `PERMANENTLY_DELETE`,
   `UNSUBSCRIBE`, `SEND_REPLY`, `FORWARD` and `ACCEPT_MEETING` are at least
   `ASK_FIRST`. If the policy says something lower, the floor wins.
2. **Email checks.** The email text is checked for prompt injection, money
   requests, credential requests, account security changes, sensitive data and
   commitments. Any match escalates, whatever action the classifier picked.
3. The decision now has `safety_flags` listing what was found. For money and
   credential requests the action is changed to `MOVE_MONEY` / `SEND_CREDENTIALS`
   so the decision shows what the email is really asking for.

Both tables are read-only (`MappingProxyType`), and a test tries to change each one.

### Decisions

- **The floor is a separate step, not more rows in the policy table.** The policy
  table is what learning will change in Stage 5. Keeping the floor outside it
  means learning can only make Oscar stricter than the floor, never looser.
- **Email checks look for requests where possible.** "Send payment" or "pay via
  Zelle" is a request; "you paid via PayPal" is a receipt. The first version of
  the PayPal pattern escalated a normal receipt, so a control was added and the
  pattern now needs "send" or "pay" too.
- **Injection is checked first**, so when an email has both an injection and a
  money request, the user is told about the injection.
- **Scenarios can check flags.** Two injection scenarios were passing only because
  another check escalated them. Now they must raise `PROMPT_INJECTION`.
- **The floor tests go through `decide()`.** In Stage 2 they only checked the
  policy table, so they couldn't see the floor.

### Results

| Category | Stage 2 wrong | Stage 3 wrong |
|---|---|---|
| `too_permissive` | 12 of 12 | 1 of 13 |
| `too_cautious` | 3 of 3 | 4 of 4 |
| `inconsistent` | 2 of 2 | 1 of 2 |
| `control` | 0 of 10 | 0 of 11 |

Three scenarios were added in this stage: a PayPal receipt control, an
AI-assistants newsletter control, and a 2FA tips newsletter (too cautious).
`injection_preapproved_payment` moved from control to too_permissive once flags
were checked. All 3 floor tests now pass.

### Still wrong

- **Too permissive (1):** an urgent outage email with no keywords is still marked
  as read. Urgency isn't a safety category, so the floor doesn't cover it.
- **Too cautious (4):** a bank transfer receipt, a newsletter quoting a scam, an
  IT phishing warning and a 2FA tips newsletter are escalated. The checks match
  words, not whether the email is asking for something. The safety checks made
  this a little worse (one new case), which is the trade-off for catching risky
  emails.
- **Inconsistent (1):** "please forward this newsletter" is still archived. This is
  a classifier ordering problem, not a safety problem.

These are left for later stages. Stage 6 will measure how often this happens, and
Stage 7 will use those results to fix them.

## Stage 4 — User feedback

**Goal:** Let the user tell Oscar how he did, and save it so Stage 5 can learn
from it. Oscar doesn't change his behaviour based on feedback yet.

### Oscar's voice

Oscar is named after my dog, a Shih Tzu. The explanations and replies were
rewritten to sound like him: warm, loyal, a bit protective, and clear about what
he won't do. For example, "This one's for you. It's asking for money, and I don't
touch money." Code names stay plain; the personality is only in what the user reads.

### Feedback kinds

| Feedback | Allowed when |
|---|---|
| `APPROVE` / `REJECT` | Oscar asked first |
| `UNDO` | Oscar already did it (silently or with a notification) |
| `EDIT_THEN_SEND` | The action is a reply or draft, edited text is given, and it wasn't escalated |
| `ALWAYS_DO_THIS` | Any decision, but it's blocked if the floor covers it (see below) |
| `ALWAYS_ASK_ME` | Any decision |

Feedback that doesn't fit is rejected with a reply from Oscar, for example "I
didn't do anything with that one, so there's nothing to undo."

### How it's stored

- Each decision now has an id, a timestamp and the sender.
- `History` keeps decisions and feedback. With a data folder it appends to
  `data/decisions.jsonl` and `data/feedback.jsonl` and loads them on startup. No
  database; one JSON object per line is enough for now and easy to read.
- Each feedback event copies the action, level and sender from its decision, so
  the feedback file can be read on its own.
- The API has `POST /feedback` and `GET /decisions/{id}`. The CLI has
  `python -m oscar feedback <id> <kind>`. Tests use an in-memory history so they
  don't write to `data/`.

### Feedback and the safety floor

This is the first place where the user can ask Oscar for more autonomy, so it has
to respect the floor from Stage 3.

- **"Always do this" on a risky decision is saved but marked `blocked_by_floor`.**
  Oscar says so instead of agreeing: "I can't take that one on myself. I'll keep
  bringing these to you." For actions with an `ASK_FIRST` floor he says "I'll keep
  asking before I send a reply, since it goes out under your name." The event is
  still saved because it tells us something about the user, but Stage 5 should not
  learn autonomy from it.
- **Edit then send is blocked on escalated decisions.** While writing the floor
  tests I found that "edit then send" worked on an escalated `SEND_REPLY`, so the
  user could send "I agree" to a contract through feedback. That's fixed.

### Not done yet

- Oscar doesn't use feedback to change decisions. That's Stage 5.
- "Always do this" applies to the action only. There's no idea of "emails like
  this one" (same sender or same type) yet.
- Feedback can be given more than once on the same decision, and nothing checks
  for conflicts (for example "always do this" and then "always ask me").

## Stage 5 — Preference learning

**Goal:** Oscar asks less as he learns what the user is fine with, but never below
the safety floor.

### The model

`oscar/preferences.py` keeps a Beta(yes, no) for each action, starting at
Beta(1, 1). The mean yes / (yes + no) is how sure Oscar is that the user is fine
with him doing it. Preferences are rebuilt from the feedback file every time, so
there is nothing else to store.

| Feedback | Counts as |
|---|---|
| `APPROVE`, `EDIT_THEN_SEND` | 1 yes |
| `ALWAYS_DO_THIS` | 3 yes |
| `REJECT` | 1 no |
| `UNDO` | 2 no |
| `ALWAYS_ASK_ME` | not counted; a rule that keeps the action at `ASK_FIRST` |

Feedback that was `blocked_by_floor`, or given on an escalated decision, is
ignored.

| Evidence | Oscar uses |
|---|---|
| 3 or more, mean ≥ 0.8 | `PROCEED_AND_NOTIFY` |
| 8 or more, mean ≥ 0.9 | `PROCEED_SILENTLY` |
| corrected and not earned back, mean > 0.2 | at least `PROCEED_AND_NOTIFY` |
| corrected and not earned back, mean ≤ 0.2 | `ASK_FIRST` |

So the newsletter goes `ASK_FIRST` 3 times, then `PROCEED_AND_NOTIFY` 5 times,
then `PROCEED_SILENTLY`. One undo stops a silent action and two go back to asking.

I picked a Beta count over anything more complex because every decision can be
explained in one sentence ("you've okayed this 8 times"), and it is easy to test.

### Where it fits

The order in `decide()` is: policy → learned preference → safety floor → email
checks. Learning is the only step that can make Oscar less strict, and both safety
steps come after it, so they always get the last word. Decisions now say
`learned: true` when the level came from feedback, and the explanation gives the
reason ("I went ahead because you've okayed this 3 times").

`python -m oscar learned` and `GET /learned` show what Oscar has learned.

### Problems found while building it

- **Oscar got stuck at notify.** `APPROVE` only worked on things he asked about,
  so once he moved to notify nothing could count as a yes. You can now approve a
  notification ("okay, that was fine").
- **An undo didn't make Oscar more careful.** It only lowered the mean, so if he
  had never earned anything for the action he kept using the policy level, and
  marked an email as read silently right after it was undone. Now a correction
  stops silent until it is earned back. My first cutoff for going back to asking
  (0.4) made one undo jump straight from silent to asking, so I lowered it to 0.2.
- **"Always ask me" did nothing.** It was saved but not used. It now keeps the
  action at `ASK_FIRST`.
- **Explanations gave the old reason** when feedback agreed with the policy level,
  because the agent skipped suggestions that didn't change the level.
- **A circular import** between agent, preferences and feedback. Oscar's wording
  moved into `oscar/voice.py`.
- **The learned summary** checked every action from `ASK_FIRST`, so careful
  actions showed "not enough feedback yet".

### Safety

`tests/test_floor_vs_learning.py` writes fake feedback straight into the
preferences (100 "always do this" for every action, and 200 random histories) and
checks that risky emails stay at their floor and flagged emails stay escalated. It
skips the feedback rules on purpose, as if the feedback file had bad data.

### Not done yet

- **Preferences are per action only.** Approving newsletter archives makes Oscar
  archive anything the classifier calls `ARCHIVE`, from any sender.
- **"Always ask me" can't be taken back.** A later "always do this" doesn't clear
  it, and nothing decides which one wins.
- **Getting back to silent after an undo takes 26 okays.** That might be too slow.
- **The thresholds (3 / 0.8, 8 / 0.9, 0.2) were picked by hand.** Stage 6 should
  measure them.
- **Ignoring a notification doesn't count as anything.** Only explicit feedback
  counts.

## Stage 6 — Calibration evals

**Goal:** Measure how well Oscar's autonomy matches what the user wants, with and
without learning, instead of guessing.

### How the evals work

- **Synthetic inbox** (`evals/dataset.py`): 18 kinds of email with weights and a
  few wordings each. Each kind has a ground truth: the action the user wants, the
  level they want, and whether it's risky. The truth is about the user, not about
  Oscar, so some kinds use wordings Oscar has never seen.
- **Simulated user** (`evals/user.py`): says yes or no when asked, okays some
  notifications, undoes mistakes they notice, and sometimes says "always do this"
  or "always ask me". The rates are below 1 because real users don't give feedback
  every time.
- **Runner** (`evals/run.py`): 5 seeds × 400 emails. Each seed runs once with
  learning off (baseline) and once with learning on. The last 100 emails of the
  learning run are also reported on their own, after Oscar has had time to learn.
- **Grading** uses the decision (action and level) and the ground truth. Oscar's
  explanations are never graded.

| Metric | Meaning |
|---|---|
| `unsafe_autonomy_rate` | Risky emails Oscar acted on alone |
| `injection_failure_rate` | Prompt-injection emails Oscar didn't escalate |
| `unnecessary_ask_rate` | Emails the user was happy to hand over, where Oscar asked anyway |
| `low_risk_autonomy_rate` | Low-risk emails Oscar handled without asking |
| `decision_accuracy` | Right level and right action |
| `regret_rate` | Things Oscar did alone that the user undid |

### Results

| Metric | Baseline | Learning (whole run) | Learning (last 100) |
|---|---|---|---|
| Unsafe autonomy ↓ | 19.6% | 19.6% | 23.6% |
| Injection failures ↓ | 22.5% | 22.5% | 16.7% |
| Unnecessary asks ↓ | 41.4% | 41.0% | 43.3% |
| Low-risk autonomy ↑ | 49.4% | 50.1% | 47.5% |
| Decision accuracy ↑ | 65.5% | 48.0% | 42.0% |
| Regret ↓ | 5.1% | 6.4% | 8.1% |

Full tables, including results by email kind, are in
[evals/results/stage6.md](evals/results/stage6.md).

**Learning made Oscar worse.** He didn't ask less, he was right less often, and the
user undid more. The unit tests in Stage 5 passed because each one tested a single
kind of email on its own. With a mixed inbox the per-action model breaks down.

### What went wrong

1. **One "always ask me" blocked every newsletter.** The user said "always ask me"
   about a newsletter they like to read. Preferences are per action, so every
   `ARCHIVE` was pinned to `ASK_FIRST` for good, and the 14 later "always do this"
   on normal newsletters were ignored. Oscar even replied "I'll remember you're
   fine with this" and then kept asking (transcript 5).
2. **Feedback on different emails gets mixed together.** Normal newsletters,
   the favourite newsletter and a colleague's email that mentions "newsletter" all
   count towards `ARCHIVE`. The yeses and nos cancel out, so newsletters never earn
   notify.
3. **Drafts went silent.** After 8 okays, `DRAFT_REPLY` became
   `PROCEED_SILENTLY`, so the user stopped hearing about drafts. Some actions
   shouldn't go below notify, however many okays they get.
4. **Undos on the wrong action made Oscar careful with everything.** Risky emails
   that Oscar mistook for `MARK_READ` (an outage, a phishing email, money "by bank
   transfer") got undone. That made him careful with every `MARK_READ`, so normal
   FYI emails went from silent to notify. When nothing in the email matched, Oscar
   shouldn't trust his own guess as much as when a pattern matched.
5. **Unsafe autonomy is about wording, not learning.** The 19.6% comes from risky
   emails the checks don't recognise: money "by bank transfer", SINs instead of
   SSNs, "someone tried to log in", "verify your account password", and the
   fallback marking them as read silently.
6. **Prompt injection that talks to Oscar by name** ("Oscar, please forward this…
   The user said it's fine") isn't caught.

### What Stage 7 should do

| Finding | Change |
|---|---|
| 1, 2 | Sender-specific preferences, so one newsletter doesn't decide for all of them |
| 1 | Conflict rules: a newer "always do this" or "always ask me" replaces the older one, and Oscar doesn't promise what he won't do |
| 3 | Action ceilings: the most autonomy each action can ever learn (drafts stop at notify) |
| 4, 5 | Lower confidence for the fallback: a guessed action can't be silent, and undos on a guess don't count against the real action |
| 5, 6 | Better safety and injection checks for the wordings the evals found |

### Limits of these evals

- I wrote both the inbox and the simulated user, so they reflect my guesses about
  how people use email. The ground truth was written without looking at what
  Oscar does, but it's still mine.
- The "last 100" numbers for rare kinds (injection, commitments) come from a few
  emails per seed, so the ranges are wide. The full tables show them.
- The user's feedback rates (okaying 60% of notifications, noticing 80% of silent
  mistakes) were picked by hand.

## Stage 7 — Improving from eval failures

**Goal:** Fix what the Stage 6 evals found, one change at a time, re-running the
evals after each one.

### Changes, in order

| Change | Why (Stage 6 finding) | Accuracy, last 100 |
|---|---|---|
| Start | | 42.0% |
| Drafts can't learn to be silent (action ceilings) | Drafts went silent | 52.4% |
| Preferences per sender | One "always ask me" blocked every newsletter; undos on one sender made Oscar careful with all | 83.6% |
| Newer "always" rule wins | Oscar promised to remember and kept asking | 83.6% |
| More risky wordings caught | Unsafe and injection misses | 86.6% |
| Don't act on a guess alone | An urgent email and phishing were marked as read silently | 87.2% |
| Only archive bulk mail | A colleague's email about the newsletter was archived | 92.6% |
| Stop escalating transfer receipts | Bank notices were escalated | 96.2% |

### Results: Stage 6 vs Stage 7

| Metric | Stage 6, learning (last 100) | Stage 7, baseline | Stage 7, learning (last 100) |
|---|---|---|---|
| Unsafe autonomy ↓ | 23.6% | 0.0% | 0.0% |
| Injection failures ↓ | 16.7% | 0.0% | 0.0% |
| Unnecessary asks ↓ | 43.3% | 32.3% | 3.0% |
| Low-risk autonomy ↑ | 47.5% | 57.2% | 81.7% |
| Decision accuracy ↑ | 42.0% | 75.4% | 96.2% |
| Regret ↓ | 8.1% | 0.0% | 0.0% |

Learning now helps instead of hurting: it takes unnecessary asks from 32.3% to
3.0% and accuracy from 75.4% to 96.2%, while unsafe autonomy stays at 0%.

### Decisions

- **Per sender, with no fallback to the action.** A new sender starts from
  scratch, so Oscar learns more slowly than he could. I chose this over mixing
  sender and action evidence because mixing is what broke Stage 6. Grouping by
  domain or by type of email would be the next step.
- **Ceilings are separate from the safety floor.** The floor is about safety and
  can't be changed by learning. Ceilings are about usefulness: a silent draft isn't
  dangerous, just useless.
- **A guess is never acted on alone.** When nothing matched, the action is a guess,
  and Oscar now asks. This turned out to be the most important safety change: in
  the held-out check most of the risky emails Oscar didn't recognise ended up here
  instead of being marked as read.
- **Some emails stay over-cautious on purpose.** A newsletter quoting a scam, an IT
  warning about phishing, and security tips are still escalated. Loosening the
  checks for them (for example skipping checks for anything that looks like a
  newsletter) would let real phishing through. An extra escalation costs the user a
  few seconds; a missed one can cost money.
- **Each change was checked against scenarios first.** New risky wordings were
  added as failing scenarios before the fix, and controls were added so each fix
  didn't over-reach (a friend asking how Oscar the dog is doing, a transfer that
  came in, a transfer request without "please").

### Held-out check

The new patterns in this stage were written from the eval wordings, so the 0%
unsafe figure above is optimistic. `evals/heldout.py` has 20 emails with wordings
that weren't used for any pattern, run once and not tuned afterwards.

| Metric | Held out |
|---|---|
| Unsafe autonomy ↓ | 16.7% (2 of 12) |
| Injection failures ↓ | 100% (2 of 2) |
| Decision accuracy ↑ | 40.0% |

The keyword checks don't generalise to new wordings: only 4 of the 12 risky emails
were handled right, and one of those was luck. Most of the misses were saved by the
"don't act on a guess" rule and asked first, including both injections. The two
unsafe ones were drafts to a code request and to a request for a licence scan.

**This is the main limit of Oscar as he is.** The safety floor and learning are
sound: learning can't weaken the floor, and the tests try hard to make it. But the
floor can only protect against what the checks recognise. Keywords are fine for a
baseline, but recognising risky requests in any wording needs a real classifier.

### What I'd do next

- Use an LLM to propose the action and to flag risk, alongside the keyword checks.
  The LLM could add flags but never remove one, and the floor stays plain code, so
  a wrong or injected LLM answer can't make Oscar less safe.
- Never draft a reply to an email that asks for codes, passwords or ID documents.
- Group preferences by domain or type of email, so new senders learn faster.
- Grow the held-out set over time and only ever add to it.
