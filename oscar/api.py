import os
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackEvent, FeedbackKind, record_feedback
from oscar.history import History, default_data_dir
from oscar.models import Decision, Email
from oscar.overview import autonomy, brief
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


@lru_cache
def get_history() -> History:
    return History(default_data_dir())


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


@app.get("/decisions", response_model=list[DecisionWithFeedback])
def list_decisions(history: History = Depends(get_history)) -> list[DecisionWithFeedback]:
    """Every decision, newest first, with the feedback given on it."""
    decisions = sorted(history.decisions.values(), key=lambda d: d.created_at, reverse=True)
    return [DecisionWithFeedback(decision=d, feedback=history.feedback_for(d.id)) for d in decisions]


@app.get("/brief")
def get_brief(history: History = Depends(get_history)) -> dict:
    """Oscar's summary of the inbox, in his words."""
    return brief(history)


@app.get("/autonomy")
def get_autonomy(history: History = Depends(get_history)) -> list[dict]:
    """How much Oscar does on his own for each sender and action, and the limits."""
    return autonomy(history)


@app.post("/demo/inbox", response_model=list[Decision])
def load_demo_inbox(history: History = Depends(get_history)) -> list[Decision]:
    """Run every email in emails/ through Oscar, as if they just arrived."""
    decisions = []
    for path in sorted(DEMO_EMAILS.glob("*.json")):
        decisions.append(decide_endpoint(Email.model_validate_json(path.read_text()), history))
    return decisions


@app.post("/demo/reset")
def reset(history: History = Depends(get_history)) -> dict:
    """Forget all decisions and feedback, so the demo can start again."""
    history.clear()
    return {"ok": True}


@app.post("/decide", response_model=Decision)
def decide_endpoint(email: Email, history: History = Depends(get_history)) -> Decision:
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
