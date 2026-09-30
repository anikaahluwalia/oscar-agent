# Oscar

Oscar is a proactive email agent. For each incoming email it proposes one action and
decides how much autonomy to take:

| Level | Meaning |
|---|---|
| `PROCEED_SILENTLY` | Do it; don't bother the user |
| `PROCEED_AND_NOTIFY` | Do it; tell the user afterwards |
| `ASK_FIRST` | Propose it; wait for the user's yes |
| `ESCALATE` | Don't act; hand it to the user |

**Status: Milestone 1 — basic Oscar.** A deterministic keyword classifier and a fixed
action → level table. Synthetic emails only; no real side effects, no learning.
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
