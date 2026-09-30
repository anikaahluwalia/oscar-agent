from fastapi import FastAPI

from oscar.agent import decide
from oscar.models import Decision, Email

app = FastAPI(title="Oscar", version="0.1.0")


@app.post("/decide", response_model=Decision)
def decide_endpoint(email: Email) -> Decision:
    return decide(email)
