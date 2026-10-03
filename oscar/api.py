import os
from datetime import datetime, timedelta, timezone
import re
import secrets
import threading
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from urllib.parse import urlencode, urlparse

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from typing import Literal

from pydantic import BaseModel

from oscar import gmail, images
from oscar.config import API_URL, WEB_URL, setting

from oscar.act import MAX_PER_CHECK, ActionError, ActionRecord, can_do, do, status_label, undo
from oscar.agent import decide
from oscar.assistant import ModelReply, Turn, model_name, talk
from oscar.feedback import ASKS_FOR_MORE, FeedbackError, FeedbackEvent, FeedbackKind, check_allowed, record_feedback
from oscar.history import History, default_data_dir, real_inbox_dir
from oscar.inbox import AlreadySyncing, recheck, sync
from oscar.models import Action, AutonomyLevel, Decision, Email
from oscar.overview import ANSWERS, autonomy, brief, latest_per_email, needs_you, permissions
from oscar.review import Reason, Review, ReviewError, ReviewLabel, Why, answer, graded, record_review, summary
from oscar.preferences import HABIT_ACTIONS, Preferences, family
from oscar.review import teaching
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


def account_file() -> Path:
    """The last Gmail address connected. Looked up each time, like real_inbox_dir(), so both
    always agree on the data folder."""
    return default_data_dir() / "gmail" / "account.txt"


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
    # A rule about every email like this one ("always do this for emails like this"), and the
    # level it sets. Only for archive, mark as read and label; checked in feedback.check_kind_rule.
    scope: Literal["sender", "kind"] = "sender"
    desired_level: AutonomyLevel | None = None


class FeedbackResponse(BaseModel):
    event: FeedbackEvent
    reply: str


class DecisionWithFeedback(BaseModel):
    decision: Decision
    feedback: list[FeedbackEvent]
    review: Review | None = None  # real inbox only: your latest review
    answer: dict | None = None  # real inbox only: what you said he should have done, and how this decision does
    done: ActionRecord | None = None  # Stage 12: what Oscar did in Gmail for it, and whether it was undone


@app.get("/decisions", response_model=list[DecisionWithFeedback])
def list_decisions(history: History = Depends(get_history)) -> list[DecisionWithFeedback]:
    """Every decision, newest first, with the feedback given on it."""
    decisions = sorted(history.decisions.values(), key=lambda d: d.created_at, reverse=True)
    return [
        DecisionWithFeedback(decision=d, feedback=history.feedback_for(d.id), review=history.review_carried_over(d.id),
                             answer=graded(history, d) if d.source == "gmail" else None,
                             done=history.action_for(d.id))
        for d in decisions
    ]


# --- The Gmail extension ----------------------------------------------------------------
# Read-only views for the extension inside Gmail. Its buttons use POST /feedback, like the app,
# so every rule there (and the safety floor) still applies.

THREAD_ID = re.compile(r"^[0-9a-f]{6,32}$")


def _extension_item(history: History, d: Decision, waiting: set[str] | None = None) -> dict:
    done = history.action_for(d.id)
    answered = any(f.kind in ANSWERS for f in history.feedback_for(d.id))
    if waiting is None:
        waiting = {w.id for w in needs_you(history)[AutonomyLevel.ASK_FIRST]}
    return {
        "id": d.id, "subject": d.subject, "sender": d.sender, "level": d.autonomy_level.value, "action": d.action.value,
        "message": d.message, "factors": d.factors, "acting": d.acting,
        "summary": d.summary or d.snippet, "status": status_label(history, d, waiting),
        "safety_rule": d.safety_rule, "learned_from": d.preference.scope if d.preference else None,
        "received_at": d.gmail.received_at.isoformat() if d.gmail and d.gmail.received_at else None,
        "thread_id": d.gmail.thread_id if d.gmail else None, "message_id": d.gmail.message_id if d.gmail else None,
        # Approve or decline: only an ask made while he could act, not answered yet.
        "answerable": d.source == "gmail" and d.acting and d.autonomy_level == AutonomyLevel.ASK_FIRST and not answered,
        "undoable": bool(done and not done.undone_at),
        "done": {"action": done.action.value, "by": done.by, "at": done.done_at.isoformat(),
                 "undone": done.undone_at is not None} if done else None,
        "reviewed": history.review_carried_over(d.id) is not None,
    }


def _waiting_ids(history: History) -> set[str]:
    return {d.id for d in needs_you(history)[AutonomyLevel.ASK_FIRST]}


@app.get("/extension/status")
def extension_status(history: History = Depends(get_history), tokens: gmail.TokenStore = Depends(get_tokens),
                     real: History = Depends(get_real_history)) -> dict:
    """What needs you, for the badge on Oscar in Gmail, and what he did on his own lately."""
    connected = bool(tokens.load())
    open_ = needs_you(history)
    waiting = open_[AutonomyLevel.ESCALATE] + open_[AutonomyLevel.ASK_FIRST]
    asks = {d.id for d in open_[AutonomyLevel.ASK_FIRST]}
    # What he did on his own in the last day, newest first, for the "handled" note in Gmail.
    since = datetime.now(timezone.utc) - timedelta(days=1)
    today = datetime.now().astimezone().date()
    mine = sorted((r for r in history.actions.values() if r.by == "oscar" and not r.undone_at),
                  key=lambda r: r.done_at, reverse=True)
    recent = [d for r in mine if r.done_at >= since and (d := history.get_decision(r.decision_id))]
    return {"connected": connected, "read_only": not (connected and acting_on(tokens, real)),
            "count": len(waiting), "waiting": [_extension_item(history, d, asks) for d in waiting[:8]],
            "recent": [_extension_item(history, d, asks) for d in recent[:5]],
            "handled_today": sum(r.done_at.astimezone().date() == today for r in mine)}


@app.get("/extension/thread/{thread_id}")
def extension_thread(thread_id: str, history: History = Depends(get_history)) -> dict:
    """Oscar's latest call on a Gmail thread, by its id as Gmail's page shows it, and his call on
    every email in it he's read, oldest first."""
    if not THREAD_ID.match(thread_id):
        raise HTTPException(404, "That isn't a Gmail thread id.")
    asks = _waiting_ids(history)
    found = [d for d in latest_per_email(history) if d.gmail and d.gmail.thread_id == thread_id]
    if not found:
        return {"found": False, "item": None, "thread": []}
    return {"found": True, "item": _extension_item(history, found[0], asks),
            "thread": [_extension_item(history, d, asks) for d in reversed(found)]}


@app.get("/extension/threads")
def extension_threads(ids: str = "", history: History = Depends(get_history)) -> dict:
    """His call on each of up to 100 threads, for the chips in Gmail's list: {thread id: label}."""
    wanted = [i for i in ids.split(",") if THREAD_ID.match(i)][:100]
    if not wanted:
        return {}
    asks, out = _waiting_ids(history), {}
    for d in latest_per_email(history):  # newest first, so each thread gets its latest email's call
        thread = d.gmail.thread_id if d.gmail else None
        if thread in wanted and thread not in out:
            out[thread] = status_label(history, d, asks)
    return out


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
def chat(request: ChatRequest, history: History = Depends(get_history), http: httpx.Client = Depends(get_http),
         tokens: gmail.TokenStore = Depends(get_tokens)) -> ModelReply:
    """Talk to Oscar. With a model key he uses read-only tools on his own records; without one, the basic chat."""
    before = len(history.feedback)
    reply = talk(history, request.message, request.history, http, request.decision_id)
    # The basic chat saves a rule you type straight away. Like a yes anywhere else, an "always do
    # this" also does what's already waiting from that sender. (The model only proposes; your yes
    # on its card goes through /feedback.)
    rules = [e for e in history.feedback[before:] if e.kind == FeedbackKind.ALWAYS_DO_THIS and not e.blocked_by_floor]
    for event in rules:
        decision = history.get_decision(event.decision_id)
        done = _approve_waiting(history, decision, tokens, http, event.scope) if decision else None
        if done:
            reply = reply.model_copy(update={"reply": done})
    return reply


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
    decision = decide(email, Preferences.from_feedback(teaching(history)))
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
    rows = Preferences.from_feedback(teaching(history)).summary()
    return [{**row, "sentence": describe_learning(row)} for row in rows]


@app.post("/feedback", response_model=FeedbackResponse)
def feedback_endpoint(request: FeedbackRequest, history: History = Depends(get_history),
                      tokens: gmail.TokenStore = Depends(get_tokens), http: httpx.Client = Depends(get_http)) -> FeedbackResponse:
    decision = history.get_decision(request.decision_id)
    if decision is None:
        raise HTTPException(404, f"I can't find decision {request.decision_id}.")
    try:
        event, reply = _answer(history, decision, request.kind, request.edited_text, tokens, http,
                               scope=request.scope, desired_level=request.desired_level)
        if request.kind in ASKS_FOR_MORE and not event.blocked_by_floor:
            reply = _approve_waiting(history, decision, tokens, http, event.scope) or reply
    except (FeedbackError, ActionError) as e:
        raise HTTPException(400, str(e))
    except gmail.GmailError as e:
        raise HTTPException(502, f"Gmail didn't let me do that: {e}")
    except httpx.HTTPError:
        raise HTTPException(502, "I couldn't reach Gmail. Try again in a minute.")
    return FeedbackResponse(event=event, reply=reply)


def _answer(history: History, decision: Decision, kind: FeedbackKind, edited_text: str | None,
            tokens: gmail.TokenStore, http: httpx.Client, *, scope: Literal["sender", "kind"] = "sender",
            desired_level: AutonomyLevel | None = None) -> tuple[FeedbackEvent, str]:
    # Stage 12: on a real inbox, approving an ask does it in Gmail, and undo puts it back. Gmail
    # goes first, and the feedback is only saved if it worked: it never says "done" (or teaches
    # Oscar) when nothing happened.
    done = history.action_for(decision.id) if decision.source == "gmail" else None
    undoable = bool(done and not done.undone_at)
    check_allowed(decision, kind, edited_text, undoable)
    if decision.source == "gmail" and decision.acting:
        if kind == FeedbackKind.APPROVE and decision.autonomy_level == AutonomyLevel.ASK_FIRST:
            if not can_do(decision):
                raise FeedbackError("That's not something I do in Gmail, so it's yours to do there.")
            if not acting_on(tokens, history):
                raise HTTPException(409, "Turn on \"Let Oscar act in Gmail\" in Settings first.")
            do(history, gmail.GmailClient(tokens, http), decision, by="you")
        elif kind == FeedbackKind.UNDO:
            undo(history, gmail.GmailClient(tokens, http), decision.id)
    return record_feedback(history, decision.id, kind, edited_text, undoable, scope=scope, desired_level=desired_level)


DONE_WORDS = {Action.ARCHIVE: "archived", Action.MARK_READ: "marked as read", Action.APPLY_LABEL: "labelled"}


# Asks a rule never clears for you: a safety check, the caution backstop or a floor put them on
# your list, or he couldn't tell what the email was. Those you answer one at a time.
NOT_BY_RULE = {"safety_check", "model_check", "caution", "floor", "guess"}


def _approve_waiting(history: History, decision: Decision, tokens: gmail.TokenStore, http: httpx.Client,
                     scope: str = "sender") -> str | None:
    """A yes to a rule ("always do this", "just handle them", "handle and tell me") also does the
    asks already waiting that it covers, as if you'd approved each one, so you don't have to go
    and approve them too: from that sender, or (for a rule about emails like this) every email
    of that kind. Only for the easy-to-undo actions (archive, mark read, label), never for an ask
    a safety rule or caution made, and at most a check's worth at a time. Each is done (and
    undoable) exactly as an Approve would be."""
    if decision.action not in HABIT_ACTIONS:
        return None
    kind = family(decision.email_type)
    covers = ((lambda d: family(d.email_type) == kind) if scope == "kind"
              else (lambda d: d.sender == decision.sender))
    waiting = [d for d in needs_you(history)[AutonomyLevel.ASK_FIRST]
               if d.action == decision.action and covers(d) and d.level_source not in NOT_BY_RULE][:MAX_PER_CHECK]
    done = 0
    for d in waiting:
        try:
            _answer(history, d, FeedbackKind.APPROVE, None, tokens, http)
            done += 1
        except HTTPException:
            break  # acting is off: none of them can be done
        except (FeedbackError, ActionError, gmail.GmailError, httpx.HTTPError):
            continue  # that one stays on your list
    if not done:
        return None
    were = "one that was" if done == 1 else f"{done} that were"
    later = "I'll just handle emails like this from now on" if scope == "kind" else "I'll take care of these from now on"
    return f"Got it! I {DONE_WORDS[decision.action]} the {were} waiting, and {later}."


def acting_on(tokens: gmail.TokenStore, real: History) -> bool:
    """Oscar acts in Gmail only when you've turned it on and the connection allows it."""
    return bool(real.settings.get("acting")) and gmail.can_act(tokens.load())


def acting_since(tokens: gmail.TokenStore, real: History) -> datetime | None:
    """When acting was turned on, if it's on. Only emails that arrived after this are acted on."""
    since = real.settings.get("acting_since")
    return datetime.fromisoformat(since) if since and acting_on(tokens, real) else None


def stop_acting(real: History) -> None:
    """Acting has to be turned on again with the switch, after any change to the connection."""
    real.set_setting("acting", False)
    real.set_setting("acting_since", None)


# --- Gmail, read-only (Stage 9) ---------------------------------------------

_states: dict[str, float] = {}  # sign-in attempts in progress, so a callback can't be forged


@app.get("/gmail")
def gmail_status(tokens: gmail.TokenStore = Depends(get_tokens), real: History = Depends(get_real_history)) -> dict:
    saved = tokens.load() or {}
    acting = acting_on(tokens, real)
    return {
        "configured": gmail.configured(),
        "connected": bool(saved),
        "address": saved.get("address"),
        "name": saved.get("name"),  # from your Google account, when it was shared
        "picture": saved.get("picture"),
        "connected_at": saved.get("connected_at"),
        "last_sync": saved.get("last_sync"),
        "auto_check_minutes": auto_check_minutes(),
        "can_act": gmail.can_act(saved),  # the connection allows changing labels
        "acting": acting,  # Oscar acts in Gmail (Stage 12)
        "read_only": not acting,
    }


class ActingRequest(BaseModel):
    on: bool


@app.post("/gmail/acting")
def set_acting(request: ActingRequest, tokens: gmail.TokenStore = Depends(get_tokens),
               real: History = Depends(get_real_history)) -> dict:
    """Let Oscar act in Gmail, or go back to only reading. Only new emails are acted on."""
    if request.on and not gmail.can_act(tokens.load()):
        raise HTTPException(409, "Connect Gmail again with permission to act first.")
    if not request.on:
        stop_acting(real)
    elif not real.settings.get("acting"):
        real.set_setting("acting", True)
        real.set_setting("acting_since", datetime.now(timezone.utc).isoformat())
    return {"acting": acting_on(tokens, real)}


def _back_to_settings(gmail_result: str) -> RedirectResponse:
    """Back to Settings with a short code saying how it went. The web app turns codes into words,
    so a crafted link can't make Oscar say anything."""
    return RedirectResponse(f"{WEB_URL}/settings?{urlencode({'gmail': gmail_result})}")


@app.get("/auth/google/start")
def google_start(act: bool = False) -> RedirectResponse:
    """Send the user to Google to give Oscar access to Gmail: read-only, or with act, permission to
    change labels (Stage 12)."""
    if not gmail.configured():
        return _back_to_settings("not_configured")
    now = time.time()
    for state, expires in list(_states.items()):
        if expires < now:
            del _states[state]
    state = secrets.token_urlsafe(24)
    _states[state] = now + 600
    return RedirectResponse(gmail.auth_url(state, act=act))


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
            "scope": granted.get("scope", ""),
        })
        saved = trial.load()
        saved["address"] = gmail.GmailClient(trial, http).address()
        saved.update(gmail.profile(granted["access_token"], http))
    except gmail.GmailError as e:
        trial.delete()
        return _back_to_settings("not_granted" if "wasn't granted" in str(e) else "google_error")
    except httpx.HTTPError:
        trial.delete()
        return _back_to_settings("google_error")
    trial.delete()
    tokens.save(saved)
    account_file().parent.mkdir(parents=True, exist_ok=True)
    account_file().write_text(saved["address"])
    stop_acting(get_real_history())  # the account just connected: a new connection starts with acting off
    return _back_to_settings("connected")


@app.post("/gmail/sync")
def gmail_sync(
    limit: int = 25,
    tokens: gmail.TokenStore = Depends(get_tokens),
    http: httpx.Client = Depends(get_http),
    real: History = Depends(get_real_history),
) -> dict:
    """Read the newest emails and decide on each. Nothing changes in Gmail unless acting is on;
    then he also does what he's sure of and labels each email with his call.
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
    result = sync(real, gmail.GmailClient(tokens, http), limit=min(max(limit, 1), 100),
                  act_since=acting_since(tokens, real), still_acting=lambda: acting_on(tokens, real),
                  label=acting_on(tokens, real))
    if acting_on(tokens, real):
        # Asks you already said yes to in Review, before a yes there counted as approving.
        approved = 0
        for decision_id in dict.fromkeys(r.decision_id for r in real.reviews):
            if approved >= MAX_PER_CHECK:
                break
            review = real.review_for(decision_id)
            approved += bool(review and approve_from_review(real, review, tokens, http))
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
def gmail_disconnect(tokens: gmail.TokenStore = Depends(get_tokens), http: httpx.Client = Depends(get_http),
                     real: History = Depends(get_real_history)) -> dict:
    """Forget the Gmail connection. Oscar's decisions and your reviews of them are kept."""
    saved = tokens.load()
    if saved:
        gmail.revoke(saved["refresh_token"], http)
        tokens.delete()
    stop_acting(real)
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


@app.get("/email-image")
def email_image(url: str, http: httpx.Client = Depends(get_http)) -> Response:
    """An image from an email, fetched by Oscar so the sender never sees your address or browser."""
    try:
        data, kind = images.fetch(url, http)
    except (images.ImageError, httpx.HTTPError):
        raise HTTPException(404, "No image there.")
    return Response(data, media_type=kind, headers={
        "Cache-Control": "private, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
    })


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
def review_endpoint(request: ReviewRequest, real: History = Depends(get_real_history),
                    tokens: gmail.TokenStore = Depends(get_tokens), http: httpx.Client = Depends(get_http)) -> Review:
    """Score one of Oscar's decisions on the real inbox. It also teaches him about that sender, and
    a yes to something he's waiting to do is your approval too (approve_from_review)."""
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
        saved = record_review(real, review)
    except ReviewError as e:
        raise HTTPException(400, str(e))
    approve_from_review(real, saved, tokens, http)
    return saved


def approve_from_review(real: History, review: Review, tokens: gmail.TokenStore, http: httpx.Client) -> bool:
    """When you review an ask he's still waiting on you for, and your answer says to do it (he got
    it right, or should have just done it, the same action), that's your approval: he does it now,
    exactly as Approve would, so you don't approve it again in the inbox. Only for what he can do
    in Gmail, and only while acting is on; otherwise it stays on your list. Returns whether he did it."""
    decision = real.get_decision(review.decision_id)
    if decision is None or decision.autonomy_level != AutonomyLevel.ASK_FIRST:
        return False
    answered = any(f.kind in ANSWERS for f in real.feedback_for(decision.id))
    if answered or real.action_for(decision.id):
        return False  # you already approved, declined or undid it
    says_do_it = review.label == ReviewLabel.CORRECT or (
        review.should_be_level in (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY)
        and review.should_be_action == decision.action)
    if not (says_do_it and decision.acting and can_do(decision)):
        return False
    try:
        _answer(real, decision, FeedbackKind.APPROVE, None, tokens, http)
        return True
    except (HTTPException, FeedbackError, ActionError, gmail.GmailError, httpx.HTTPError):
        return False  # the review is saved either way; it just stays on your list


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
