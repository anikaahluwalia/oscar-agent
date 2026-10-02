import os
import secrets
import threading
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from urllib.parse import urlencode, urlparse

import httpx
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from oscar import gmail
from oscar.config import API_URL, WEB_URL, setting

from oscar.agent import decide
from oscar.assistant import ModelReply, Turn, model_name, talk
from oscar.feedback import FeedbackError, FeedbackEvent, FeedbackKind, record_feedback
from oscar.history import History, default_data_dir, real_inbox_dir
from oscar.inbox import AlreadySyncing, recheck, sync
from oscar.models import Action, AutonomyLevel, Decision, Email
from oscar.overview import autonomy, brief, permissions
from oscar.review import Reason, Review, ReviewError, ReviewLabel, Why, answer, graded, record_review, summary
from oscar.preferences import Preferences
from oscar.voice import describe_learning

def auto_check_minutes() -> float:
    """How often Oscar checks Gmail on his own. 0 turns it off (the tests do)."""
    try:
        return max(float(setting("OSCAR_AUTO_CHECK_MINUTES", "5")), 0)
    except ValueError:
        return 5


def _auto_check(stop: threading.Event, every: float) -> None:
    """Check Gmail every few minutes while the API is running, so you don't have to."""
    if stop.wait(15):  # give the API a moment to start first
        return
    while True:
        tokens = get_tokens()
        if tokens.load():
            try:
                with httpx.Client(timeout=20) as http:
                    check_gmail(tokens, http, get_real_history())
            except (AlreadySyncing, gmail.GmailError, httpx.HTTPError) as e:
                print(f"Oscar: automatic Gmail check skipped. {e}")
        if stop.wait(every):
            return


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop = threading.Event()
    minutes = auto_check_minutes()
    if minutes:
        threading.Thread(target=_auto_check, args=(stop, minutes * 60), daemon=True, name="oscar-auto-check").start()
    yield
    stop.set()


app = FastAPI(title="Oscar", version="0.1.0", lifespan=lifespan)

# The web app runs on its own port in development. OSCAR_WEB_ORIGINS (comma
# separated) overrides the default, e.g. when running a second copy on another port.
WEB_ORIGINS = os.environ.get("OSCAR_WEB_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=WEB_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Only answer to the names the API is meant to be reached by, so another website
# can't get at it through a DNS trick.
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "testserver", urlparse(API_URL).hostname or "localhost"],
)


@app.middleware("http")
async def json_only_posts(request: Request, call_next):
    """Every POST must say it's JSON. A browser only sends that cross-site after asking the
    API first (CORS), so another website can't quietly trigger a sync or a disconnect."""
    if request.method == "POST" and not request.headers.get("content-type", "").startswith("application/json"):
        return JSONResponse({"detail": "Send JSON."}, status_code=415)
    return await call_next(request)

DEMO_EMAILS = Path(__file__).resolve().parent.parent / "emails"


# The demo inbox and the real inbox are kept completely apart: their own decisions,
# feedback and learning. Otherwise what Oscar learned on the demo would change his
# decisions on the real inbox, and the real-inbox numbers wouldn't be honest.
@lru_cache
def demo_history() -> History:
    return History(default_data_dir())


GMAIL_DIR = default_data_dir() / "gmail"
ACCOUNT_FILE = GMAIL_DIR / "account.txt"  # the last Gmail address connected


@lru_cache
def real_history(folder: Path) -> History:
    """Each Gmail account gets its own history, so connecting a different one never mixes them."""
    return History(folder)


def get_real_history() -> History:
    return real_history(real_inbox_dir())


def get_tokens() -> gmail.TokenStore:
    return gmail.TokenStore(GMAIL_DIR / "token.json")


def get_http() -> httpx.Client:
    return httpx.Client(timeout=20)


def get_history(tokens: gmail.TokenStore = Depends(get_tokens), real: History = Depends(get_real_history)) -> History:
    """The real inbox once Gmail is connected, the demo inbox until then."""
    return real if tokens.load() else demo_history()


def get_demo_history(tokens: gmail.TokenStore = Depends(get_tokens), history: History = Depends(get_history)) -> History:
    if tokens.load():
        raise HTTPException(409, "Gmail is connected, so the demo inbox is off. Disconnect Gmail to use it.")
    return history


class FeedbackRequest(BaseModel):
    decision_id: str
    kind: FeedbackKind
    edited_text: str | None = None


class FeedbackResponse(BaseModel):
    event: FeedbackEvent
    reply: str


class DecisionWithFeedback(BaseModel):
    decision: Decision
    feedback: list[FeedbackEvent]
    review: Review | None = None  # real inbox only: your latest review
    answer: dict | None = None  # real inbox only: what you said he should have done, and how this decision does


@app.get("/decisions", response_model=list[DecisionWithFeedback])
def list_decisions(history: History = Depends(get_history)) -> list[DecisionWithFeedback]:
    """Every decision, newest first, with the feedback given on it."""
    decisions = sorted(history.decisions.values(), key=lambda d: d.created_at, reverse=True)
    return [
        DecisionWithFeedback(decision=d, feedback=history.feedback_for(d.id), review=history.review_carried_over(d.id),
                             answer=graded(history, d) if d.source == "gmail" else None)
        for d in decisions
    ]


@app.get("/brief")
def get_brief(history: History = Depends(get_history)) -> dict:
    """Oscar's summary of the inbox, in his words."""
    return brief(history)


@app.get("/autonomy")
def get_autonomy(history: History = Depends(get_history)) -> list[dict]:
    """How much Oscar does on his own for each sender and action, and the limits."""
    return autonomy(history)


@app.get("/permissions")
def get_permissions(history: History = Depends(get_history)) -> list[dict]:
    """What Oscar may do on his own with each kind of email, and what learning can't change."""
    return permissions(history)


class ChatRequest(BaseModel):
    message: str
    decision_id: str | None = None
    history: list[Turn] = []  # the conversation so far, so Oscar can follow it


@app.post("/chat", response_model=ModelReply)
def chat(request: ChatRequest, history: History = Depends(get_history), http: httpx.Client = Depends(get_http)) -> ModelReply:
    """Talk to Oscar. With a model key he uses read-only tools on his own records; without one, the basic chat."""
    return talk(history, request.message, request.history, http, request.decision_id)


@app.get("/chat/status")
def chat_status() -> dict:
    """Which model the chat uses, or null for the basic chat."""
    return {"model": model_name()}


@app.post("/demo/inbox", response_model=list[Decision])
def load_demo_inbox(history: History = Depends(get_demo_history)) -> list[Decision]:
    """Run every email in emails/ through Oscar, as if they just arrived."""
    decisions = []
    for path in sorted(DEMO_EMAILS.glob("*.json")):
        decisions.append(decide_endpoint(Email.model_validate_json(path.read_text()), history))
    return decisions


@app.post("/demo/reset")
def reset(history: History = Depends(get_demo_history)) -> dict:
    """Forget all decisions and feedback, so the demo can start again."""
    history.clear()
    return {"ok": True}


@app.post("/decide", response_model=Decision)
def decide_endpoint(email: Email, history: History = Depends(get_demo_history)) -> Decision:
    bulk = history.settings.get("bulk_action")
    decision = decide(email, Preferences.from_feedback(history.feedback), bulk_action=Action(bulk) if bulk else None)
    history.add_decision(decision)
    return decision


@app.get("/decisions/{decision_id}", response_model=Decision)
def get_decision(decision_id: str, history: History = Depends(get_history)) -> Decision:
    decision = history.get_decision(decision_id)
    if decision is None:
        raise HTTPException(404, f"I can't find decision {decision_id}.")
    return decision


class InboxSettings(BaseModel):
    # What to do with promos and newsletters: mark them read, or archive them. None: Oscar's default.
    bulk_action: Literal["MARK_READ", "ARCHIVE"] | None = None


@app.get("/inbox-settings", response_model=InboxSettings)
def get_inbox_settings(history: History = Depends(get_history)) -> InboxSettings:
    return InboxSettings(**{k: v for k, v in history.settings.items() if k in InboxSettings.model_fields})


@app.post("/inbox-settings", response_model=InboxSettings)
def set_inbox_settings(settings: InboxSettings, history: History = Depends(get_history)) -> InboxSettings:
    """Applies to emails Oscar reads from now on; decisions already made stay as they were."""
    history.set_setting("bulk_action", settings.bulk_action)
    return settings


@app.get("/learned")
def learned(history: History = Depends(get_history)) -> list[dict]:
    rows = Preferences.from_feedback(history.feedback).summary()
    return [{**row, "sentence": describe_learning(row)} for row in rows]


@app.post("/feedback", response_model=FeedbackResponse)
def feedback_endpoint(request: FeedbackRequest, history: History = Depends(get_history)) -> FeedbackResponse:
    if history.get_decision(request.decision_id) is None:
        raise HTTPException(404, f"I can't find decision {request.decision_id}.")
    try:
        event, reply = record_feedback(history, request.decision_id, request.kind, request.edited_text)
    except FeedbackError as e:
        raise HTTPException(400, str(e))
    return FeedbackResponse(event=event, reply=reply)


# --- Gmail, read-only (Stage 9) ---------------------------------------------

_states: dict[str, float] = {}  # sign-in attempts in progress, so a callback can't be forged


@app.get("/gmail")
def gmail_status(tokens: gmail.TokenStore = Depends(get_tokens)) -> dict:
    saved = tokens.load() or {}
    return {
        "configured": gmail.configured(),
        "connected": bool(saved),
        "address": saved.get("address"),
        "connected_at": saved.get("connected_at"),
        "last_sync": saved.get("last_sync"),
        "auto_check_minutes": auto_check_minutes(),
        "read_only": True,
    }


def _back_to_settings(gmail_result: str) -> RedirectResponse:
    """Back to Settings with a short code saying how it went. The web app turns codes into words,
    so a crafted link can't make Oscar say anything."""
    return RedirectResponse(f"{WEB_URL}/settings?{urlencode({'gmail': gmail_result})}")


@app.get("/auth/google/start")
def google_start() -> RedirectResponse:
    """Send the user to Google to give Oscar read-only access to Gmail."""
    if not gmail.configured():
        return _back_to_settings("not_configured")
    now = time.time()
    for state, expires in list(_states.items()):
        if expires < now:
            del _states[state]
    state = secrets.token_urlsafe(24)
    _states[state] = now + 600
    return RedirectResponse(gmail.auth_url(state))


@app.get("/auth/google/callback")
def google_callback(
    state: str = "",
    code: str = "",
    error: str = "",
    tokens: gmail.TokenStore = Depends(get_tokens),
    http: httpx.Client = Depends(get_http),
) -> RedirectResponse:
    if _states.pop(state, 0) < time.time():
        return _back_to_settings("expired")
    if error or not code:
        return _back_to_settings("cancelled")
    # Try the new connection on its own first, so a failed attempt never breaks one that works.
    trial = gmail.TokenStore(tokens.path.with_name("token.new.json"))
    try:
        granted = gmail.exchange_code(code, http)
        if "refresh_token" not in granted:
            return _back_to_settings("no_lasting_access")
        trial.save({
            "refresh_token": granted["refresh_token"],
            "access_token": granted["access_token"],
            "expires_at": time.time() + granted.get("expires_in", 3600),
            "connected_at": time.time(),
        })
        saved = trial.load()
        saved["address"] = gmail.GmailClient(trial, http).address()
    except gmail.GmailError as e:
        trial.delete()
        return _back_to_settings("not_granted" if "wasn't granted" in str(e) else "google_error")
    except httpx.HTTPError:
        trial.delete()
        return _back_to_settings("google_error")
    trial.delete()
    tokens.save(saved)
    ACCOUNT_FILE.parent.mkdir(parents=True, exist_ok=True)
    ACCOUNT_FILE.write_text(saved["address"])
    return _back_to_settings("connected")


@app.post("/gmail/sync")
def gmail_sync(
    limit: int = 25,
    tokens: gmail.TokenStore = Depends(get_tokens),
    http: httpx.Client = Depends(get_http),
    real: History = Depends(get_real_history),
) -> dict:
    """Read the newest emails and log what Oscar would do with each. Nothing changes in Gmail.
    Oscar also does this on his own every few minutes; this is for checking right now."""
    if not tokens.load():
        raise HTTPException(409, "Gmail isn't connected.")
    try:
        result = check_gmail(tokens, http, real, limit)
    except AlreadySyncing as e:
        raise HTTPException(409, str(e))
    except gmail.GmailError as e:
        raise HTTPException(502, str(e))
    except httpx.HTTPError:
        raise HTTPException(502, "I couldn't reach Gmail. Try again in a minute.")
    return result.model_dump()


def check_gmail(tokens: gmail.TokenStore, http: httpx.Client, real: History, limit: int = 25):
    """One check for new email, by you or by the timer, and note when it happened."""
    result = sync(real, gmail.GmailClient(tokens, http), limit=min(max(limit, 1), 100))
    saved = tokens.load()
    if saved:
        saved["last_sync"] = time.time()
        tokens.save(saved)
    return result


@app.post("/gmail/recheck")
def gmail_recheck(
    tokens: gmail.TokenStore = Depends(get_tokens),
    http: httpx.Client = Depends(get_http),
    real: History = Depends(get_real_history),
) -> dict:
    """Re-read recent emails with the latest Oscar. Old decisions and reviews are kept."""
    if not tokens.load():
        raise HTTPException(409, "Gmail isn't connected.")
    try:
        return recheck(real, gmail.GmailClient(tokens, http)).model_dump()
    except AlreadySyncing as e:
        raise HTTPException(409, str(e))
    except (gmail.GmailError, httpx.HTTPError):
        raise HTTPException(502, "I couldn't reach Gmail. Try again in a minute.")


@app.post("/gmail/disconnect")
def gmail_disconnect(tokens: gmail.TokenStore = Depends(get_tokens), http: httpx.Client = Depends(get_http)) -> dict:
    """Forget the Gmail connection. Oscar's decisions and your reviews of them are kept."""
    saved = tokens.load()
    if saved:
        gmail.revoke(saved["refresh_token"], http)
        tokens.delete()
    return {"ok": True}


@app.get("/emails/{decision_id}/content")
def email_content(
    decision_id: str,
    tokens: gmail.TokenStore = Depends(get_tokens),
    http: httpx.Client = Depends(get_http),
    real: History = Depends(get_real_history),
) -> dict:
    """The whole real email, fetched from Gmail when you open it so you can see what it is.
    Read-only, and nothing is saved: Oscar's history keeps only the first 160 characters."""
    decision = real.get_decision(decision_id)
    if decision is None or decision.source != "gmail" or not decision.gmail:
        raise HTTPException(404, "That isn't one of your real emails.")
    if not tokens.load():
        raise HTTPException(409, "Gmail isn't connected.")
    try:
        return gmail.email_content(gmail.GmailClient(tokens, http).message(decision.gmail.message_id))
    except gmail.GmailError as e:
        if e.status == 404:
            raise HTTPException(404, "Gmail doesn't have this email anymore.")
        raise HTTPException(502, str(e))
    except httpx.HTTPError:
        raise HTTPException(502, "I couldn't reach Gmail. Try again in a minute.")


class ReviewRequest(BaseModel):
    """Either a label alone ("Yes" is CORRECT, "Not sure" is SKIP), or what Oscar should have
    done (should_be_level and the rest), which is a "No"; its label is worked out here."""
    decision_id: str
    label: ReviewLabel | None = None
    should_be_level: AutonomyLevel | None = None
    should_be_action: Action | None = None
    why: Why | None = None
    reasons: list[Reason] = []
    actual_type: str | None = None
    label_name: str | None = None
    note: str | None = None


@app.post("/reviews", response_model=Review)
def review_endpoint(request: ReviewRequest, real: History = Depends(get_real_history)) -> Review:
    """Score one of Oscar's decisions on the real inbox. Oscar doesn't learn from this."""
    decision = real.get_decision(request.decision_id)
    try:
        if request.should_be_level is not None and decision is not None:
            review = answer(decision, request.should_be_level, request.should_be_action, why=request.why,
                            reasons=request.reasons, actual_type=request.actual_type, label_name=request.label_name,
                            note=request.note)
        elif request.label in (ReviewLabel.CORRECT, ReviewLabel.SKIP):
            review = Review(decision_id=request.decision_id, label=request.label, note=request.note)
        elif decision is None:
            raise ReviewError(f"I can't find decision {request.decision_id}.")
        else:
            # Half-answers ("Incorrect action" alone) hold back grading, so new ones aren't taken.
            raise ReviewError("Say what Oscar should have done.")
        return record_review(real, review)
    except ReviewError as e:
        raise HTTPException(400, str(e))


@app.get("/reviews/summary")
def review_summary(real: History = Depends(get_real_history)) -> dict:
    return summary(real)


# --- Eval runs (Stage 10) -----------------------------------------------------

EVAL_RUNS = Path(__file__).resolve().parent.parent / "evals" / "results" / "runs"
EVAL_CASES = Path(__file__).resolve().parent.parent / "evals" / "cases"


def _runs() -> list[dict]:
    import json

    return [json.loads(p.read_text()) for p in sorted(EVAL_RUNS.glob("*.json"))]


@app.get("/evals/runs")
def eval_runs() -> list[dict]:
    """Saved eval runs, newest first, without their per-case results. Every number comes from a run file."""
    runs = sorted(_runs(), key=lambda r: r["created_at"], reverse=True)
    return [{k: v for k, v in r.items() if k != "cases"} for r in runs]


@app.get("/evals/runs/{run_id}")
def eval_run(run_id: str) -> dict:
    """One run with every case result, and each case's email and ground truth, so a number can be traced to its cases."""
    import json

    from evals.harness import load, regression_suite

    run = next((r for r in _runs() if r["run_id"] == run_id), None)
    if run is None:
        raise HTTPException(404, "No run with that id.")
    cases = {c.id: c for path in EVAL_CASES.glob("*.jsonl") for c in load(path)} | {c.id: c for c in regression_suite()}
    for result in run["cases"]:
        case = cases.get(result["case_id"])
        if case:
            result["email"] = case.email.model_dump()
            result["rationale"] = case.rationale
    return run
