# Oscar

Oscar is a proactive email agent, named after my dog Oscar, a Shih Tzu. Like the real
Oscar, he's loyal, keeps an eye on things, and comes to get you when something isn't
right.

For each incoming email Oscar proposes one action and decides how much autonomy to take:

| Level | Autonomy |
|---|---|
| `PROCEED_SILENTLY` | Action is done by Oscar |
| `PROCEED_AND_NOTIFY` | Action is done by Oscar and user is notified |
| `ASK_FIRST` | Action is proposed to user, user must accept or decline |
| `ESCALATE` | User is notified, Oscar takes no action |

**Status: Stage 4 — user feedback.** Oscar uses a keyword classifier, a fixed
action → level table and a safety floor the table can't lower. You can now give
feedback on each decision, and it is saved. Oscar doesn't learn from it yet.
Synthetic emails only; no real side effects.
See [DESIGN.md](DESIGN.md) for decisions and known weaknesses.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

## Run the demo

```bash
.venv/bin/python -m oscar                          # every email in emails/
.venv/bin/python -m oscar emails/vendor_wire.json  # one email
```

## Give Oscar feedback

Each decision prints an id. Use it to tell Oscar how he did:

```bash
.venv/bin/python -m oscar feedback <decision_id> APPROVE
.venv/bin/python -m oscar feedback <decision_id> EDIT_THEN_SEND --text "Sure, Thursday works."
```

Feedback kinds: `APPROVE`, `REJECT`, `UNDO`, `EDIT_THEN_SEND`, `ALWAYS_DO_THIS`,
`ALWAYS_ASK_ME`. Decisions and feedback are saved in `data/` (set `OSCAR_DATA_DIR`
to use another folder).

## Run the API

```bash
.venv/bin/uvicorn oscar.api:app --reload
curl -X POST localhost:8000/decide -H 'content-type: application/json' -d @emails/newsletter.json
curl -X POST localhost:8000/feedback -H 'content-type: application/json' -d '{"decision_id": "<id>", "kind": "APPROVE"}'
```

## Tests

```bash
.venv/bin/pytest -v
```

Scenarios Oscar gets wrong today are marked as expected failures (`xfail`). To see
the list with the reason for each one:

```bash
.venv/bin/pytest -rx
```
