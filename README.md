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

Oscar uses keyword rules and, when they find nothing, a model that says what kind of
email it is; a starting level per action; what he has learned from your answers; and a
safety floor plus checks on the email itself that learning can never lower. There's a
web app and a Chrome extension for Gmail. On a real Gmail he starts read-only, and can
only ever do undoable things (mark read, archive, label, save a draft). Eval results are
in [evals/results/latest/report.md](evals/results/latest/report.md) and
[evals/results/REPORT-model-fill.md](evals/results/REPORT-model-fill.md), and example
transcripts are in [examples/TRANSCRIPTS.md](examples/TRANSCRIPTS.md).

![Oscar's home screen](assets/home.png)

| Inbox | What Oscar Knows |
|---|---|
| ![Inbox](assets/inbox.png) | ![What Oscar Knows](assets/memory.png) |

See [DESIGN.md](DESIGN.md) for the key decisions and example transcripts, and
[docs/STAGES.md](docs/STAGES.md) for the full stage-by-stage log.

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

Open http://localhost:3000 and pick a way in:

- **Try Oscar**: a simulated inbox, no Gmail needed. It's just for your browser and kept
  only in the API's memory, but every email goes through Oscar's real learning and safety
  checks. A small guide shows how he learns in about a minute. The banner at the top has
  **Check now** (two more emails come in), **Reset demo** and **Leave**. After changing a
  demo email (`emails/demo/`), the prompt or the model, run `.venv/bin/python -m oscar.demo --read`.
- **Connect Gmail**: your real inbox (see "Connect a real Gmail inbox" below).

In the app, Oscar's four levels are called **Quietly** (did it), **Tell me** (did it
and told you), **Ask me** (asks first) and **Stopped** (stopped it).

- **Today**: what's waiting on you, one email at a time, and what Oscar took care of today.
- **Chat**: ask Oscar about your email, or teach him a rule. He shows you the rule
  before he follows it.
- **Inbox**: every email and what Oscar did with it. Open one to approve, decline or
  undo, and tap **Why?** for the facts behind the decision.
- **Review**: check Oscar's calls on your real inbox, one email at a time.
- **What Oscar knows**: what he's learned about each sender, which you can change or
  forget, and where each kind of email starts.
- **Promises**: the things he never does alone, and what he held back lately.
- **Settings**: Gmail, appearance (light, dark or match your device), and leaving the demo.

Try "what needs me?", "what did you handle?" or a rule like "always archive emails
from hello@evergreen-clothing.example" in **Chat**. In the demo, approve the Evergreen Clothing sale and
choose **Handle all emails like this**, then press **Check now**: he archives a sale from
a different shop on his own, and still stops the tricky one.

## Oscar in Gmail (Chrome extension)

Load the `extension` folder in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
Oscar peeks out of the corner of Gmail with what needs you and his call on the open email.
See `extension/README.md`.

## Connect a real Gmail inbox (read-only)

Oscar can read a real Gmail inbox and note what he *would* do with each email.
He only gets read-only access: nothing in Gmail changes. You review his decisions
in the app, and mistakes become regression tests (see docs/STAGES.md, Stage 9).

1. Make a Gmail account for testing, or use your own.
2. In [Google Cloud Console](https://console.cloud.google.com), create a project and
   enable the **Gmail API**.
3. Under **Google Auth Platform**, set up the app (External) and add your Gmail
   address as a **test user**.
4. Under **Clients**, create a **Web application** client with this redirect URI:
   `http://localhost:8000/auth/google/callback`
5. Copy `.env.example` to `.env` and fill in the client ID and secret. `.env` is
   ignored by git.
6. Restart the API and open **Settings → Connect Gmail**. Oscar checks for new email
   every 5 minutes on his own while the API runs (change it with
   `OSCAR_AUTO_CHECK_MINUTES` in `.env`), or press **Check now**.

Connecting also asks for your name and photo, so they show in the corner of the app.
If you connected before that, connect again to see them.

While Gmail is connected, the demo inbox is off and the app shows your real inbox.
**Review** goes through Oscar's decisions. How your answers grade him is kept for evaluation, not
shown in the app: `python -m oscar reviews` lists every decision you disagreed with, `python -m
oscar replay` grades today's Oscar on the emails you've answered, and `GET /progress` on the API
gives the same numbers.

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
.venv/bin/python -m pytest -q                     # unit and integration tests
.venv/bin/python -m evals.runner --model fill     # trap/control pairs and the learning experiment; writes evals/results/latest/
.venv/bin/python -m evals.measure --model fill    # learn, check for leakage, score held-out, safety and regression cases
.venv/bin/python -m evals.regressions             # just the regression cases
.venv/bin/python -m oscar replay                  # today's Oscar on the real emails you've answered (needs Gmail connected)
```

`--model fill` uses the model readings saved in `evals/cache/`, so it runs without a key and
gives the same results; it only calls the model (with `GEMINI_API_KEY`) for emails it hasn't read.
Leave `--model` out for the rules alone (`evals.measure` then writes `evals/results/REPORT.md`).
`evals.measure --policy careful-p2` tries another learning policy, and `evals.compare OLD.json
NEW.json` puts two saved runs side by side.

`evals.measure` learns only from a generated learning inbox, scores the held-out
set (220 cases) before and after learning, the safety suite (57 cases) and the
regression cases, saves every run with every case's result in
`evals/results/runs/`, and exits with 1 if the build is unsafe or regressed. The method is in
docs/STAGES.md (Stage 10).

The older `python -m evals` (writes `evals/RESULTS.md`) is the Stage 6–7 method, kept
for the record.
