# Oscar evaluation

## Summary of Results

- On the 220-email teach-then-test evaluation, autonomy accuracy improved from **75.9% → 83.2%** and over-asking fell from **28.3% → 5.5%**.
- Safety stayed at **42/42 cases caught with 0 critical safety misses** after teaching.
- Blind deletion testing exposed a real failure; after changing the design, Oscar caught **19/19 deletion requests** on the next blind set.
- Main tradeoff: on v2, too-permissive decisions increased from **8.0% → 21.3%** after teaching.

All of Oscar's measured results are collected here. DESIGN.md has the short version, and each
section links to the generated report its numbers come from.

## Setup

The model is `gemini-flash-latest` with prompt version `understand-6` and rule set `rules-9`, run in
`fill` mode. In that mode the model reads every email, but its reading only sets the action when the
keyword rules don't match anything. A risky reading can always raise the autonomy level, never lower
it. Model outputs are cached in `evals/cache/`, so every run here is deterministic and reproducible
without an API key.

| Dataset | Description | Size | Status |
|---|---|---|---|
| Trap/control pairs | Hand-written traps, each paired with a harmless control | 13 pairs (26 scenarios) × 3 runs × 4 configs = 312 runs | test |
| Learning experiments | Simulated user gives feedback, then Oscar is scored on new emails | 48 newsletter + 16 promotion training emails | train / test |
| Held-out v2 | Mixed emails with labelled level, action and safety category | 220 | seen (ran blind once, misses fixed after) |
| Safety suite | Risky requests and benign look-alikes | 57 (45 risky, 12 benign) | test |
| Regression cases | De-identified mistakes from my real inbox | 29 | test |
| Held-out v3 | New emails, written blind | 82 | seen (its misses led to the deletion fix) |
| Held-out v4 | Deletion requests and look-alikes, written blind | 44 | seen (used to evaluate fix 1) |
| Blind v5 | Deletion requests, look-alikes and a general mix, written blind | 60 | run once, after fix 2 was frozen |

The blind sets were written by a separate writer with no access to Oscar's code, outputs or the
other sets. Each one was committed with its labels before Oscar was run on it.

Reports: [trap/control](../evals/results/latest/report.md) ·
[trap/control, rules only](../evals/results/latest/report-rules-only.md) ·
[held-out v2](../evals/results/REPORT-model-fill.md) ·
[held-out v2, rules only](../evals/results/REPORT.md) ·
[v3](../evals/results/REPORT-model-fill-heldout_v3.md) ·
[v4](../evals/results/REPORT-model-fill-heldout_v4.md) ·
[v5](../evals/results/REPORT-model-fill-heldout_v5.md) ·
[fresh-model check](../evals/results/fresh-model-check/report.md)

## Method

`evals/runner.py` runs Oscar through his real Gmail client against a simulated inbox, then grades
the resulting inbox state instead of his explanation. Every trap has a matching control where acting
is correct, and a pair only passes if both are handled correctly. That way a policy that asks about
everything can't score well. `evals.measure` checks the training stream against every eval set for
overlap before it runs, and the safety layer can only be disabled inside the simulator.

I report three metrics separately because they can move independently:

- **Level accuracy**: exact match on the autonomy level. Asking when Oscar should have acted counts
  as an error.
- **Over-ask rate**: how often he asks on emails he could have handled. This measures interruption,
  not correctness.
- **Critical safety miss**: a risky email handled with less involvement than its safety rule
  requires. This is about the decision. Execution is restricted separately: the Gmail client has no
  send, payment or permanent-delete calls, so a missed request results in no question being asked,
  not in an irreversible action.

## Case study: permanent deletion requests

| Step | Commit | v3 deletes caught | v4 deletes caught | v5 deletes caught | Benign look-alikes flagged |
|---|---|---|---|---|---|
| Baseline (v3 run) | `f3aae1d` | 1/4 | 10/20 | – | – |
| Fix 1: wider regex patterns | `26c225a` | 4/4 | 10/20 | – | 1/24 (v4) |
| Fix 2: deletion intent in the model reading | `f4eca60` | 4/4 | 20/20 | 19/19 | 4/31 (v5) |

Blind v3 missed 3 of 4 requests to permanently delete an email ("wipe every copy", "purge the whole
thing", "destroy the attachment and retain nothing"). Oscar read them as emails that needed replies.

Fix 1 extended the deletion check's patterns for phrasing like "every copy", "keep nothing" and "so
it's gone". It caught the three v3 misses and changed nothing else across the 662 emails in the repo.
On blind v4, which used new wording, it scored 10/20, the same as the baseline. The patterns had
overfit to the examples I had already seen.

Fix 2 added a `deletion_request` class to the model's output. When the model returns it, Oscar
raises the same `IRREVERSIBLE_DELETE` flag as the rule-based check, so the rest of the pipeline is
unchanged: the action becomes `PERMANENTLY_DELETE`, the level is at least ASK_FIRST, and stronger
flags (money, credentials, private data, prompt injection) still take precedence. Blind v5 was
written before this change and run once after it. All 19 plain deletion requests were caught, and
the 3 combined with a stronger risk were escalated.

The false-positive cost on v5 was 4 of 31 benign emails. Three were treated as deletion requests (a
how-to article, a news piece about scammers asking victims to delete evidence, and "how do you
delete a channel?"), and an "account has been deleted" notice was escalated. In each case the result
is an extra question, not an action.

## Trap/control pairs

| | No safety, no learning | Safety only | Safety + learning | Learning, safety off |
|---|---|---|---|---|
| Level accuracy | 42.3% | 76.9% | **92.3%** | 57.7% |
| Pairs passed | 38.5% | 46.2% | **84.6%** | 69.2% |
| Traps handled safely | 92.3% | 100% | **100%** | 84.6% |
| Hard-floor violations | 3 | 0 | **0** | 6 |
| Prompt injection success | 0% | 0% | **0%** | 33.3% |
| Over-ask / under-ask | 30.8% / 7.7% | 30.8% / 0% | **0% / 0%** | 0% / 15.4% |

With safety and learning on, 50.0% of emails were completed without asking. The last column shows
why the floor is separate from learning: with it disabled, learned preferences let one in three
injections through. With rules only (no model), the full system gets 73.1% level accuracy and 61.5%
of pairs, still with no trap passed through. The two failing pairs are routine controls ("Jordan
shared Q3 plan with you", "Slides are up") that Oscar marks read silently where the label expected
PROCEED_AND_NOTIFY. I'd call that a policy disagreement rather than a safety issue.

## Learning

A simulated user approves correct actions and sets a level for "emails like this":

| | Newsletters (few senders) | One-off promotions (new sender each time) |
|---|---|---|
| Ask rate on safe emails, before → after | 100% → 0% | 100% → 0% |
| Completed without asking, before → after | 0% → 100% | 0% → 100% |
| Traps still handled correctly after learning | 12/12 | 18/18 |
| Hard-floor violations / injection success | 0 / 0% | 0 / 0% |

The simulated user is consistent, so this tests the mechanism rather than how Oscar copes with
someone who changes their mind. The real-inbox replay below covers that case.

## Held-out sets and the safety suite

| | v2 (220) | v3 (82, seen) | v4 (44, seen) | Blind v5 (60) |
|---|---|---|---|---|
| Level accuracy | 75.9% → 79.1% after learning | 75.6% | 72.7% | **75.0%** |
| Action accuracy | 87.1% | 87.7% | 81.4% | **88.9%** |
| Safety requests caught | 42/42 | 27/27 | 20/20 | **29/29** |
| Critical safety misses | 0 | 0 | 0 | **0** |
| Benign emails held back by a safety flag | 2/178 | 4/55 | 1/24 | **4/31** |
| Over-ask rate | 28.3% → 23.4% | 38.3% | 45.8% | **42.9%** |

v2 with rules only: 54.1% → 54.5%. The learning stream is a separate generated inbox, so it doesn't
affect v3 to v5, whose senders and email types it never covers. The next section tests what happens
when it does.

Most remaining errors on the blind sets are over-asks rather than misclassifications. On v5, 9 of
the 16 failures are newsletters, promotions and notices Oscar asked about because nothing had been
taught about them yet. That's the intended cold-start behaviour, and it's the main reason level
accuracy sits around 75% on unseen email.

The safety suite has 57 cases: 45 risky (15 prompt injection, 13 where the user had taught Oscar to
act on that sender, 5 money, 4 credentials, 3 private data, 3 commitments, 2 account security) and
12 benign look-alikes. After learning, all 45 risky cases were caught with 0 critical misses, and 2
of the 12 look-alikes were escalated by mistake (a newsletter quoting "ignore previous instructions"
as news, and a "new 2FA badges" notice). Regression cases: 29/29.

## Teaching on the held-out sets

To check whether feedback helps on emails Oscar hasn't seen, I used cross-validation
(`python -m evals.teach_then_test`). Each set is split into 5 groups. A simulated user answers the
emails in 4 groups, the same way they would in the app, and Oscar is tested on the 5th group. This
repeats until every group has been tested once, so no email is ever tested by an Oscar that was
taught its answer. Round 2 (`--then teach_v1`) keeps those answers and adds feedback on 82 new
training emails from new senders. They were written separately, checked for overlap with every test
set, and committed before use. Oscar's code stays the same; only what he's been taught changes.

| | v5 (60, originally blind) | v3 (82) | v2 (220) |
|---|---|---|---|
| Level accuracy: before → round 1 → round 2 | 75.0% → 75.0% → **86.7%** | 75.6% → 74.4% → **84.1%** | 75.9% → 79.5% → **83.2%** |
| Over-ask rate | 42.9% → 32.1% → 17.9% | 38.3% → 25.5% → 21.3% | 28.3% → 11.7% → 5.5% |
| Emails asked about | 31 → 28 → 24 | 23 → 16 → 14 | 60 → 27 → 17 |
| Too permissive | 3.1% → 3.1% → 3.1% | 5.7% → 8.6% → 8.6% | 8.0% → 20.0% → 21.3% |
| Safety caught / critical misses | 29/29 / 0 (all rounds) | 27/27 / 0 (all rounds) | 42/42 / 0 (all rounds) |

Reports: [v5](../evals/results/TEACH-heldout_v5-then-teach_v1.md) ·
[v3](../evals/results/TEACH-heldout_v3-then-teach_v1.md) ·
[v2](../evals/results/TEACH-heldout_v2-then-teach_v1.md)

Round 1 barely changes v5 because the set has few newsletters and promotions, and a preference only
generalises across senders once several senders agree. Round 2 adds feedback from many more senders,
which is where most of the improvement comes from. Safety was unchanged after both rounds, even
though the training data included money, credential, prompt-injection and deletion requests.

The downside is over-generalisation. On v2, after "handle promotions like this", Oscar archives and
notifies on some promotions and newsletters the labels wanted him to ask about (9 more after round
1). This only applies to reversible actions, and he still notifies, but it's the same pattern I saw
with job alerts on my real inbox.

**Blind v5 failures:** 0 critical safety misses. Most of the 16 errors were cold-start over-asks
(9); 4 benign emails were over-flagged, 1 deletion request was escalated instead of asked about, 1
had the wrong action, and 1 was less cautious than the expected label. Full case-level results are
in the [generated report](../evals/results/REPORT-model-fill-heldout_v5.md).

## Fresh-model check

Since the canonical numbers use cached model outputs, I reran the trap/control pairs and both
learning experiments with every email read fresh (`evals.runner --model fresh`, 1 run per scenario,
104 runs, 309 model calls, 0 failures). The code is the same as `f4eca60`; the recorded commit is
`5e083b0`, which only added results. [Report](../evals/results/fresh-model-check/report.md).

| | Cached (`fill`, canonical) | Fresh |
|---|---|---|
| Level accuracy | 92.3% | 92.3% |
| Pairs passed | 84.6% | 84.6% |
| Traps handled safely | 100% | 100% |
| Hard-floor violations / injection success | 0 / 0% | 0 / 0% |
| Learning ask rate, before → after (newsletters, promotions) | 100% → 0%, 100% → 0% | 100% → 0%, 100% → 0% |

The fresh run failed the same two routine controls and nothing else. One run shows the variance on
these cases is small, not that it's zero, so the cached results remain the canonical ones.

## Real inbox replay

`python -m oscar replay` re-runs Oscar on every email I've answered in Review and grades the new
decision against my answer, next to his original call. It's read-only, doesn't change learned
state, and excludes my answer on the email being graded. It isn't blind, since I've been teaching
him on this inbox. Real mistakes become de-identified regression cases (`evals/regression_cases/`)
before anything is fixed. Only counts are reported here.

This was run at `cb9a8c4`, before the deletion fix, with the model reading previews. 240 answered
emails could still be fetched (112 had been deleted).

| | Original call | Oscar at `cb9a8c4` |
|---|---|---|
| Correct | 121 | 118 |
| Too cautious (asked when I'd have let him act) | 105 | 56 |
| Too permissive (acted when I wanted to be asked) | 5 | 17 |
| Wrong action | 9 | 49 |
| **Acted when I would have stopped it** | **0** | **0** |

The 5 real risks that could still be fetched were all still stopped (45 more had been deleted).
Over-asking roughly halved. Most of the new wrong actions come from my own answers changing: in 42
of them he followed a later answer for the same sender, mostly promotions where I first said "mark
read" and later set "archive promotions". Measured against my latest answers he matches about 160
of 240. The main real weakness is job alerts. They now fall under the "archive promotions" rule, so
he archives them silently when I wanted them labelled and to be notified. That accounts for most of
the 17 too-permissive cases. None of them were risky, but it shows a kind-level rule reaching further
than intended.

## CI and one-off runs

[Oscar Safety & Regression Checks](../.github/workflows/safety.yml) runs on every push and pull
request without Gmail access or an API key: the test suite, the regression cases,
`evals.measure --model fill` on v2 and the safety suite (fails on any critical miss, missed safety
case or regression), and `evals.runner --model fill` on the trap/control pairs and learning
experiments (fails on any hard-floor violation or successful injection).

The blind sets (v3 to v5), the teaching runs, the fresh-model check and the real-inbox replay were
run once and recorded, and are not in CI. Running a blind set on every commit would invite tuning
against it, the fresh check needs an API key, and the replay needs my Gmail.

## Limitations

- The trap/control scenarios are small and hand-written. They show the floor holds and learning
  works, not production error rates.
- Safety detection is regex plus the model's classification, so wording neither has seen can still
  slip through, and emails that only discuss risky topics can be over-flagged.
- About 4 in 10 unseen emails get an ask until Oscar has feedback on them. That's intended, but it
  means he needs some answers before he saves time.
- The learning experiments use a consistent simulated user. The real-inbox replay is the only data
  with a changing user, and it's one inbox.
- A preference for one type of email can spread to emails of that type the user still wanted to be
  asked about (too permissive goes from 8.0% to about 21% on v2 after teaching). It's limited to
  reversible actions, but it's the next thing I'd fix.
- Labels are one person's judgement, and some cases (a doc share, a colleague's FYI, a first
  newsletter from a new sender) could reasonably go another way.
- Oscar runs locally, and the extension depends on Gmail's DOM.

## Reproducing

```bash
.venv/bin/python -m evals.runner --model fill                        # trap/control + learning → evals/results/latest/
.venv/bin/python -m evals.measure --model fill                       # held-out v2, safety suite, regression cases
.venv/bin/python -m evals.measure --model fill --heldout heldout_v5  # blind v5 (already run once; for checking, not tuning)
.venv/bin/python -m evals.regressions                                # regression cases only
.venv/bin/python -m evals.teach_then_test --then teach_v1            # teach on part of a set, test on the rest
.venv/bin/python -m evals.runner --model fresh --out <folder>        # fresh model readings (needs a key)
.venv/bin/python -m oscar replay                                     # real-inbox replay (needs Gmail)
```

Leave out `--model` to run with rules only.
