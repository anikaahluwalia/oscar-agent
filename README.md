# Oscar

Oscar is a proactive email agent. For each incoming email it proposes one action and
decides how much autonomy to take:

| Level | Autonomy |
|---|---|
| `PROCEED_SILENTLY` | Action is done by Oscar |
| `PROCEED_AND_NOTIFY` | Action is done by Oscar and user is notified |
| `ASK_FIRST` | Action is proposed to user, user must accept or decline |
| `ESCALATE` | User is notified, Oscar takes no action |

**Status: Stage 2 — baseline testing.** Oscar uses a keyword classifier and a fixed
action → level table. Stage 2 adds scenarios in `scenarios/baseline.json` that show
where this goes wrong. Synthetic emails only; no real side effects, no learning.
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

## Run the API

```bash
.venv/bin/uvicorn oscar.api:app --reload
curl -X POST localhost:8000/decide -H 'content-type: application/json' -d @emails/newsletter.json
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
