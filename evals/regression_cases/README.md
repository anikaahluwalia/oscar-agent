# Regression cases from the real inbox

Every meaningful mistake Oscar makes on the real inbox becomes a case here
**before** his logic changes. `python -m oscar reviews` lists the decisions
you disagreed with.

How to write one:

1. Rewrite the email in your own words. Keep what caused the mistake (a word,
   the kind of sender) and leave out names, addresses and anything personal.
   Real emails never go in the repo.
2. Add its opposite as a second case, so a fix can't just loosen a rule. A
   harmless "Your payment was received" gets "Please send the payment to our
   new account".
3. Add one or two rewordings. Put another rewording in `evals/heldout.py`, which
   is never used for writing patterns.
4. Run `python -m evals.regressions`. The new case should fail; that shows it
   reproduces the mistake. Then fix Oscar and run the full suite.

Cases are only ever added, never edited or removed.

One JSON file per case:

```json
{
  "id": "payment-received",
  "added": "2026-10-02",
  "found_as": "UNNECESSARY_FLAGGING",
  "why": "Escalated a payment confirmation because it said \"payment\".",
  "twin": "payment-request-new-account",
  "email": {"sender": "billing@shop.example", "subject": "Payment received", "body": "..."},
  "expect": {"level": "PROCEED_SILENTLY", "action": "APPLY_LABEL"}
}
```

`expect.action` is optional; leave it out when only the level matters.
