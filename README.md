<p align="center"><img src="assets/oscar.png" alt="Oscar" width="160"></p>

# Oscar -- your inbox companion

Oscar is a proactive email agent, named after my dog Oscar. Like the real
Oscar, he's loyal, keeps an eye on things, and comes to get you when something isn't
right (on your inbox).

## What it is

For each email, Oscar picks one action (archive, mark read, label, draft a reply...) and how much
to do on his own.

Unique features about Oscar:
- Learns from your answers so he asks less
- A built-in safety floor that a user cannot bypass (money transfers, account security, etc)

For more about features, please check out [DESIGN.md](DESIGN.md).

Through user feedback and patterns, Oscar chooses between 4 levels...

| Level | In the app | What happens |
|---|---|---|
| `PROCEED_SILENTLY` | Quietly | Oscar does it. |
| `PROCEED_AND_NOTIFY` | Tell me | Oscar does it and tells you. |
| `ASK_FIRST` | Ask me | Oscar asks first. You say yes or no. |
| `ESCALATE` | Stopped / Needs you | Oscar does nothing and brings it straight to you. |

## Try it

You need Python 3.11+ and Node 20.9+. No Gmail, no API key and no account needed.

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn oscar.api:app --reload      # the API, on localhost:8000
```

In another terminal:

```bash
cd web
npm install
npm run dev                                   # the web app, on localhost:3000
```

Open http://localhost:3000 and press **Try Oscar**. You get a pretend inbox of made-up emails,
just for your browser and kept only in the API's memory. Every email still goes through Oscar's
real decisions, learning and safety checks. He asks your name, then a short tour shows how he
learns: approve the Evergreen sale, choose **Handle all emails like this**, press **Check now**,
and he archives a sale from a different shop on his own while still stopping the one with hidden
instructions. After that the tour walks through the rest of the app. The banner at the top has
**Check now**, **Reset demo** and **Leave**.

In the app:

- **Today**: what's waiting on you, and what Oscar took care of today.
- **Chat**: ask about your email ("what needs me?"), or teach him a rule. He shows you the rule
  before he follows it.
- **Inbox**: every email and what he did with it. Approve, decline or undo, and tap **Why?**.
- **Review**: check his calls one email at a time.
- **What Oscar knows**: what he's learned about each sender, which you can change or forget.
- **Promises**: the things he never does alone, and what he held back lately.
- **Settings**: Gmail, your name, light or dark, and how Oscar shows up in Gmail.

## Connect your Gmail

Oscar starts read-only: he notes what he *would* do and nothing in Gmail changes. If you turn on
**Let Oscar act in Gmail** in Settings, he can only do things you can undo: mark read, archive,
add his own labels, and save a draft he tells you about. He never sends email, deletes your email
or moves money; the Gmail code has nothing that can, apart from taking back a draft he saved. He acts on at most 25 emails per check, and only on new email.

1. Make a Gmail account for testing, or use your own.
2. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the
   **Gmail API**.
3. Under **Google Auth Platform**, set up the app (External) and add your Gmail address as a
   **test user**.
4. Under **Clients**, create a **Web application** client with this redirect URI:
   `http://localhost:8000/auth/google/callback`
5. Copy `.env.example` to `.env` and fill in the client ID and secret. `.env` is ignored by git.
6. Restart the API, open http://localhost:3000 and press **Connect Gmail** (or **Settings →
   Connect Gmail**). Oscar checks for new email every 5 minutes while the API runs, or press
   **Check now**.

The first time you connect, he looks over your last six months of email (read-only) and offers
habits he noticed; nothing changes until you answer. While Gmail is connected the demo inbox is
off. Google keeps the connection for 7 days while the app is in testing mode, so you may need to
connect again after that.

## The Chrome extension

1. Start the API (and the web app) as above.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and
   pick the `extension` folder.
3. Open Gmail.

Each email Oscar has read gets a chip in your list: Handled, FYI, Needs you or Stopped. When you
open an email, a panel opens beside it with his call first, what he did, and what you can do
(Yes or Not this one, Undo, or his draft). Why is folded until you want it. Until you let him act
in Gmail, the panel asks you to check his call instead. Oscar also sits in the corner and says
hello with how things stand when Gmail opens. It needs your real Gmail connected, and only talks
to the API on localhost. More in [extension/README.md](extension/README.md).

## Configuration

Everything goes in `.env` (copy `.env.example`). The keys that matter:

| Key | What it does |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Your Google OAuth client, for Connect Gmail. |
| `GEMINI_API_KEY` | Optional. For the chat, reading emails the rules don't recognise, and reply drafts. Without it Oscar uses the rules alone, a basic chat and no drafts. The demo and the evals don't need it. |
| `OSCAR_MODEL_READS` | Whether the model reads your real emails: `off` (default), `preview` (sender, subject, first few lines) or `full`. Only use `full` with a paid key: on the free tier Google may use what's sent. |
| `OSCAR_CONTENT_ONLY_SENDERS` | Comma-separated addresses Oscar judges only by what their emails say, never by who sent them. Handy for your own test address that sends every kind of email. |
| `OSCAR_AUTO_CHECK_MINUTES` | How often he checks Gmail on his own (default 5, 0 = never). |
| `OSCAR_API_URL`, `OSCAR_WEB_URL` | Only if the API or web app run somewhere other than localhost:8000 and :3000. Then also set `NEXT_PUBLIC_OSCAR_API` for the web app (in `web/.env.local`), `OSCAR_WEB_ORIGINS` for the API, and the extension's Options. |

Decisions and feedback are saved in `data/` (set `OSCAR_DATA_DIR` to use another folder).

## Tests and evals

```bash
.venv/bin/pytest -q                               # unit and integration tests
.venv/bin/python -m evals.runner --model fill     # trap/control pairs and the learning experiment → evals/results/latest/
.venv/bin/python -m evals.measure --model fill    # held-out set before/after learning, safety suite, regression cases
.venv/bin/python -m evals.regressions             # just the regression cases
.venv/bin/python -m oscar replay                  # today's Oscar on the real emails you've answered (needs Gmail)
```

`--model fill` uses the model readings saved in `evals/cache/`, so it needs no key and gives the
same results. Leave `--model` out for the rules alone. Results are in
[evals/results/latest/report.md](evals/results/latest/report.md) and
[evals/results/REPORT-model-fill.md](evals/results/REPORT-model-fill.md), and the numbers that
matter are summed up in [DESIGN.md](DESIGN.md#6-evaluation). `evals.measure` exits with 1 if the
build is unsafe or a regression case fails.

After changing a demo email, the reading prompt or the model, run
`.venv/bin/python -m oscar.demo --read` (needs a key) to save the demo's readings and drafts again.

## Where things are

| Path | What's there |
|---|---|
| `oscar/` | Oscar himself: `agent.py` (`decide()`), `safety.py`, `preferences.py` (learning), `policy.py`, `gmail.py`, `api.py`, `demo.py` and `pretend_gmail.py` (the demo) |
| `web/` | The web app (Next.js) |
| `extension/` | The Chrome extension for Gmail |
| `evals/` | Eval runners, cases, saved model readings, and results in `evals/results/` |
| `emails/demo/` | The demo's made-up emails, with their saved readings and drafts |
| `tests/` | The tests |
| [docs/STAGES.md](docs/STAGES.md) | How Oscar was built, stage by stage, with every result and mistake |
| [examples/TRANSCRIPTS.md](examples/TRANSCRIPTS.md) | Example conversations with Oscar, all his real output |
