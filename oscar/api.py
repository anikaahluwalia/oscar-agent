import os
import secrets
import time
from functools import lru_cache
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from oscar import gmail
from oscar.config import WEB_URL

from oscar.agent import decide
from oscar.chat import ChatReply, answer
from oscar.feedback import FeedbackError, FeedbackEvent, FeedbackKind, record_feedback
from oscar.history import History, default_data_dir
from oscar.inbox import sync
from oscar.models import Action, AutonomyLevel, Decision, Email
from oscar.overview import autonomy, brief
from oscar.review import Review, ReviewError, ReviewLabel, record_review, summary
from oscar.preferences import Preferences
from oscar.voice import describe_learning

app = FastAPI(title="Oscar", version="0.1.0")

# The web app runs on its own port in development. OSCAR_WEB_ORIGINS (comma
# separated) overrides the default, e.g. when running a second copy on another port.
WEB_ORIGINS = os.environ.get("OSCAR_WEB_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=WEB_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_EMAILS = Path(__file__).resolve().parent.parent / "emails"


# The demo inbox and the real inbox are kept completely apart: their own decisions,
# feedback and learning. Otherwise what Oscar learned on the demo would change his
# decisions on the real inbox, and the real-inbox numbers wouldn't be honest.
@lru_cache
def demo_history() -> History:
    return History(default_data_dir())


@lru_cache
def real_history() -> History:
    return History(default_data_dir() / "gmail")


def get_real_history() -> History:
    return real_history()


def get_tokens() -> gmail.TokenStore:
    return gmail.TokenStore(default_data_dir() / "gmail" / "token.json")


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


@app.get("/decisions", response_model=list[DecisionWithFeedback])
def list_decisions(history: History = Depends(get_history)) -> list[DecisionWithFeedback]:
    """Every decision, newest first, with the feedback given on it."""
    decisions = sorted(history.decisions.values(), key=lambda d: d.created_at, reverse=True)
    return [
        DecisionWithFeedback(decision=d, feedback=history.feedback_for(d.id), review=history.review_for(d.id))
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


class ChatRequest(BaseModel):
    message: str
    decision_id: str | None = None


@app.post("/chat", response_model=ChatReply)
def chat(request: ChatRequest, history: History = Depends(get_history)) -> ChatReply:
    """Talk to Oscar. decision_id is set when the user asks about a specific email."""
    return answer(history, request.message, request.decision_id)


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
    decision = decide(email, Preferences.from_feedback(history.feedback))
    history.add_decision(decision)
    return decision


@app.get("/decisions/{decision_id}", response_model=Decision)
def get_decision(decision_id: str, history: History = Depends(get_history)) -> Decision:
    decision = history.get_decision(decision_id)
    if decision is None:
        raise HTTPException(404, f"I can't find decision {decision_id}.")
    return decision


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
        "read_only": True,
    }


def _back_to_settings(**params: str) -> RedirectResponse:
    from urllib.parse import urlencode

    return RedirectResponse(f"{WEB_URL}/settings?{urlencode(params)}")


@app.get("/auth/google/start")
def google_start() -> RedirectResponse:
    """Send the user to Google to give Oscar read-only access to Gmail."""
    if not gmail.configured():
        return _back_to_settings(gmail="not_configured")
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
        return _back_to_settings(gmail="error", reason="That sign-in link expired. Try connecting again.")
    if error or not code:
        return _back_to_settings(gmail="error", reason="Google sign-in was cancelled.")
    try:
        granted = gmail.exchange_code(code, http)
        if "refresh_token" not in granted:
            raise gmail.GmailError("Google didn't give Oscar lasting access. Remove Oscar in your Google account and connect again.")
        tokens.save({
            "refresh_token": granted["refresh_token"],
            "access_token": granted["access_token"],
            "expires_at": time.time() + granted.get("expires_in", 3600),
            "connected_at": time.time(),
        })
        saved = tokens.load()
        saved["address"] = gmail.GmailClient(tokens, http).address()
        tokens.save(saved)
    except gmail.GmailError as e:
        tokens.delete()
        return _back_to_settings(gmail="error", reason=str(e))
    return _back_to_settings(gmail="connected")


@app.post("/gmail/sync")
def gmail_sync(
    limit: int = 25,
    tokens: gmail.TokenStore = Depends(get_tokens),
    http: httpx.Client = Depends(get_http),
    real: History = Depends(get_real_history),
) -> dict:
    """Read the newest emails and log what Oscar would do with each. Nothing changes in Gmail."""
    saved = tokens.load()
    if not saved:
        raise HTTPException(409, "Gmail isn't connected.")
    try:
        new = sync(real, gmail.GmailClient(tokens, http), limit=min(max(limit, 1), 100))
    except gmail.GmailError as e:
        raise HTTPException(502, str(e))
    saved = tokens.load() or saved
    saved["last_sync"] = time.time()
    tokens.save(saved)
    return {"new": len(new)}


@app.post("/gmail/disconnect")
def gmail_disconnect(tokens: gmail.TokenStore = Depends(get_tokens), http: httpx.Client = Depends(get_http)) -> dict:
    """Forget the Gmail connection. Oscar's decisions and your reviews of them are kept."""
    saved = tokens.load()
    if saved:
        gmail.revoke(saved["refresh_token"], http)
        tokens.delete()
    return {"ok": True}


class ReviewRequest(BaseModel):
    decision_id: str
    label: ReviewLabel
    should_be_level: AutonomyLevel | None = None
    should_be_action: Action | None = None
    actual_type: str | None = None
    note: str | None = None


@app.post("/reviews", response_model=Review)
def review_endpoint(request: ReviewRequest, real: History = Depends(get_real_history)) -> Review:
    """Score one of Oscar's decisions on the real inbox. Oscar doesn't learn from this."""
    try:
        return record_review(real, Review(**request.model_dump()))
    except ReviewError as e:
        raise HTTPException(400, str(e))


@app.get("/reviews/summary")
def review_summary(real: History = Depends(get_real_history)) -> dict:
    return summary(real)
