<p align="center"><img src="assets/oscar.png" alt="Oscar" width="160"></p>

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

**Status: Stage 8 — product UI.** Oscar uses a keyword classifier, a fixed action →
level table, what he has learned from your feedback (per sender), and a safety
floor that neither the table nor learning can lower. There's a web app to see what
he handled, what he told you about, what needs you and what he's learned. Eval
results are in [evals/RESULTS.md](evals/RESULTS.md), a held-out check is in
[evals/results/heldout.md](evals/results/heldout.md), and example transcripts are in
[examples/TRANSCRIPTS.md](examples/TRANSCRIPTS.md). Synthetic emails only; no real
side effects.

![Oscar's home screen](assets/home.png)

| Inbox | What Oscar Knows |
|---|---|
| ![Inbox](assets/inbox.png) | ![What Oscar Knows](assets/memory.png) |

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
`ALWAYS_ASK_ME`, and `SEEN` ("Mark as reviewed" on an email Oscar stopped, which
teaches him nothing). To see what Oscar has learned from it:

```bash
.venv/bin/python -m oscar learned
```
 Decisions and feedback are saved in `data/` (set `OSCAR_DATA_DIR`
to use another folder).

## Run the web app

Start the API (below), then in another terminal:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000. Until Gmail is connected, the inbox is the example
emails: click **Bring in the demo emails** on Home (it's also in **Settings**).

In the app, Oscar's four levels are called **Handled** (did it quietly), **FYI**
(did it and told you), **Needs You** (asks first) and **Blocked** (stopped it).

- **Home**: what Oscar is up to, a count of each status, his recent activity, a
  few things he's learned, and a box to talk to him.
- **Inbox**: every email with what Oscar did. Open one to approve, edit, decline
  or undo, and tap **Why?** for the facts behind the decision.
- **Needs You**: everything waiting on you, in one list.
- **Activity**: a log of everything Oscar did, suggested or stopped.
- **What Oscar Knows**: what he's learned per sender (you can change it), and the
  protected rules learning can't touch.
- **Evals**: the eval results from `evals/RESULTS.md`.
- **Settings**: appearance and the demo inbox. Notifications and the autonomy
  preference are only saved in your browser for now; the backend doesn't use them.

**Ask Oscar** (the box on Home, or the button in the corner) answers "what needs me?", "what did you
handle?", "what do you know about me?", and rules like "always archive emails from
digest@morningbrew-weekly.example". Approve the newsletter a few times and bring
the emails in again to watch Oscar learn.

## Connect a real Gmail inbox (read-only)

Oscar can read a real Gmail inbox and note what he *would* do with each email.
He only gets read-only access: nothing in Gmail changes. You review his decisions
in the app, and mistakes become regression tests (see DESIGN.md, Stage 9).

1. Make a Gmail account for testing, or use your own.
2. In [Google Cloud Console](https://console.cloud.google.com), create a project and
   enable the **Gmail API**.
3. Under **Google Auth Platform**, set up the app (External) and add your Gmail
   address as a **test user**.
4. Under **Clients**, create a **Web application** client with this redirect URI:
   `http://localhost:8000/auth/google/callback`
5. Copy `.env.example` to `.env` and fill in the client ID and secret. `.env` is
   ignored by git.
6. Restart the API, open **Settings → Connect Gmail**, then **Check for new email**.

While Gmail is connected, the demo inbox is off and the app shows your real inbox.
**Review** lists Oscar's decisions to score, and **Evals** shows the results. From
the command line, `python -m oscar reviews` lists every decision you disagreed with.

Google keeps the connection for 7 days while the app is in testing mode, so you may
need to connect again after that.

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

## Evals

```bash
.venv/bin/python -m evals              # writes evals/RESULTS.md
.venv/bin/python -m evals.transcripts  # writes examples/TRANSCRIPTS.md
.venv/bin/python -m evals.heldout      # writes evals/results/heldout.md
```
