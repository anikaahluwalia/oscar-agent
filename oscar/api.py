from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackEvent, FeedbackKind, record_feedback
from oscar.history import History, default_data_dir
from oscar.models import Decision, Email
from oscar.preferences import Preferences

app = FastAPI(title="Oscar", version="0.1.0")


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
    return Preferences.from_feedback(history.feedback).summary()


@app.post("/feedback", response_model=FeedbackResponse)
def feedback_endpoint(request: FeedbackRequest, history: History = Depends(get_history)) -> FeedbackResponse:
    if history.get_decision(request.decision_id) is None:
        raise HTTPException(404, f"I can't find decision {request.decision_id}.")
    try:
        event, reply = record_feedback(history, request.decision_id, request.kind, request.edited_text)
    except FeedbackError as e:
        raise HTTPException(400, str(e))
    return FeedbackResponse(event=event, reply=reply)
