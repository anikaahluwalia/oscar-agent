"""Talking to Oscar.

No LLM yet: Oscar understands a few kinds of message and answers from what he
already knows. Rules ("always archive emails from ...") go through the same
feedback path as the buttons, so the safety floor answers here too. Anything
else gets an honest "I can't do that yet".
"""

import re

from pydantic import BaseModel

from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision
from oscar.overview import brief, is_read_only, latest_per_email, needs_you
from oscar.preferences import Preferences
from oscar.safety import ACTION_FLOORS
from oscar.voice import describe_learning


class ChatReply(BaseModel):
    reply: str
    decisions: list[str] = []  # decisions Oscar is talking about, shown as chips in the app


HELP = ('I can tell you what needs you, what I handled, what I know about you, or why I made a call. '
        'You can also teach me, like "always archive emails from digest@ai-weekly.example".')

# Words in a rule, and the action they mean.
ACTION_WORDS: list[tuple[str, Action]] = [
    (r"\barchiv", Action.ARCHIVE),
    (r"\blabel", Action.APPLY_LABEL),
    (r"\bmark\w* .*read\b", Action.MARK_READ),
    (r"\bdraft", Action.DRAFT_REPLY),
    (r"\bforward", Action.FORWARD),
    (r"\bunsubscrib", Action.UNSUBSCRIBE),
    (r"\baccept", Action.ACCEPT_MEETING),
    (r"\bdelete", Action.PERMANENTLY_DELETE),
    (r"\b(pay|wire|transfer|send (the )?(money|funds|payment))", Action.MOVE_MONEY),
    (r"\b(password|credential|code)", Action.SEND_CREDENTIALS),
    (r"\b(reply|respond|send)", Action.SEND_REPLY),
]


def _subjects(decisions: list[Decision], limit: int = 4) -> str:
    names = [f'"{d.subject}"' for d in decisions[:limit]]
    more = len(decisions) - limit
    return ", ".join(names) + (f" and {more} more" if more > 0 else "")


def _why(decision: Decision) -> ChatReply:
    middle = decision.steps[1:-1]
    # The explanation already says what Oscar noticed, so don't say it twice.
    if decision.noticed and decision.noticed in decision.explanation:
        middle = [s for s in middle if not s.startswith("Noticed")]
    how = f" Here's how I got there: {'; '.join(s[0].lower() + s[1:] for s in middle)}." if middle else ""
    return ChatReply(reply=f"{decision.explanation}{how}", decisions=[decision.id])


def _needs_you(history: History) -> ChatReply:
    open_ = needs_you(history)
    for_you, waiting, told = (open_[level] for level in (AutonomyLevel.ESCALATE, AutonomyLevel.ASK_FIRST,
                                                         AutonomyLevel.PROCEED_AND_NOTIFY))
    if not for_you and not waiting and not told:
        return ChatReply(reply="Nothing needs you right now. I'll bring you anything new.")
    if is_read_only(history):
        parts = [f"I'd bring you {_subjects(for_you)}." if for_you else "",
                 f"I'd ask you about {_subjects(waiting)}." if waiting else "",
                 f"I'd tell you about {_subjects(told)}." if told else "",
                 "I'm only reading your inbox for now, so review these on the Review page."]
        return ChatReply(reply=" ".join(p for p in parts if p), decisions=[d.id for d in for_you + waiting + told])
    parts = []
    if for_you:
        parts.append(f"For you: {_subjects(for_you)}.")
    if waiting:
        parts.append(f"Waiting for your okay: {_subjects(waiting)}.")
    if told:
        parts.append(f"I did these and told you, in case you want to check: {_subjects(told)}.")
    return ChatReply(reply=" ".join(parts), decisions=[d.id for d in for_you + waiting + told])


def _handled(history: History) -> ChatReply:
    current = latest_per_email(history)
    quiet = [d for d in current if d.autonomy_level == AutonomyLevel.PROCEED_SILENTLY]
    told = [d for d in current if d.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY]
    if is_read_only(history):
        if not quiet and not told:
            return ChatReply(reply="I'm only reading your inbox for now, and so far I'd have checked with you on everything.")
        parts = ["I'm only reading your inbox for now, so I haven't done anything."]
        if quiet:
            parts.append(f"I'd have handled {len(quiet)} quietly: {_subjects(quiet)}.")
        if told:
            parts.append(f"I'd have done {len(told)} and told you: {_subjects(told)}.")
        return ChatReply(reply=" ".join(parts), decisions=[d.id for d in quiet + told])
    if not quiet and not told:
        return ChatReply(reply="I haven't done anything on my own yet. So far I've been checking with you.")
    parts = []
    if quiet:
        parts.append(f"I handled {len(quiet)} quietly: {_subjects(quiet)}.")
    if told:
        parts.append(f"I did {len(told)} and told you: {_subjects(told)}.")
    return ChatReply(reply=" ".join(parts), decisions=[d.id for d in quiet + told])


def _known(history: History) -> ChatReply:
    rows = Preferences.from_feedback(history.feedback).summary()
    if not rows:
        return ChatReply(reply="I haven't learned anything yet. Tell me how I did on a few emails and I'll pick up your habits.")
    lines = [describe_learning(r) for r in rows]
    return ChatReply(reply="Here's what I know so far: " + " ".join(line[0].upper() + line[1:] for line in lines))


def _rule(history: History, text: str) -> ChatReply:
    # "don't ask me" and "stop asking" mean go ahead, even though they contain "ask me".
    go_ahead = re.search(r"\b(don'?t|do not|stop|no need to) ask", text)
    ask = not go_ahead and bool(re.search(r"\b(always ask|ask me|check with me|never)\b", text))
    action = next((a for pattern, a in ACTION_WORDS if re.search(pattern, text)), None)

    # Money and credentials never move, whoever the sender is, so there's nothing to look up.
    floor = ACTION_FLOORS.get(action) if action else None
    if not ask and floor and floor[0] == AutonomyLevel.ESCALATE:
        return ChatReply(reply=f"I can't take that one on myself. {floor[1][0].upper()}{floor[1][1:]}, so I'll keep bringing these to you.")

    match = re.search(r"\bfrom ([\w.@+-]+)", text)
    if not match:
        return ChatReply(reply='Who from? Say something like "always archive emails from digest@ai-weekly.example".')
    who = match.group(1).strip(".").lower()

    seen = [d for d in sorted(history.decisions.values(), key=lambda d: d.created_at, reverse=True)
            if who in d.sender.lower() and d.level_source != "safety_check"]
    if action:
        seen = [d for d in seen if d.action == action]
    if not seen:
        return ChatReply(reply=f"I haven't seen that from {who} yet. Once one comes in, tell me again and I'll remember.")

    decision = seen[0]
    kind = FeedbackKind.ALWAYS_ASK_ME if ask else FeedbackKind.ALWAYS_DO_THIS
    try:
        _, reply = record_feedback(history, decision.id, kind)
    except FeedbackError as e:
        reply = str(e)
    return ChatReply(reply=reply, decisions=[decision.id])


def answer(history: History, message: str, decision_id: str | None = None) -> ChatReply:
    text = message.lower().strip()

    if decision_id:
        decision = history.get_decision(decision_id)
        if decision is None:
            return ChatReply(reply="I can't find that email anymore.")
        if not text or "why" in text:
            return _why(decision)

    if re.search(r"\b(always|never|stop asking|ask me)\b", text) or re.search(r"\b(don'?t|do not) ask\b", text):
        return _rule(history, text)
    if "why" in text:
        return ChatReply(reply="Which email? Tap Why? on one and I'll tell you how I decided.")
    if re.search(r"\b(need|needs|waiting|for me|pending)\b", text):
        return _needs_you(history)
    if re.search(r"\b(handle|handled|did you do|done|today)\b", text):
        return _handled(history)
    if re.search(r"\b(know|learn|learned|habit|about me)\b", text):
        return _known(history)
    if re.search(r"\b(summary|brief|how are we|status)\b", text):
        b = brief(history)
        return ChatReply(reply=" ".join(p for p in (b["summary"], b["trend"], b["learned"]) if p))
    if re.search(r"^(hi|hey|hello|thanks|thank you)\b", text):
        return ChatReply(reply="Hi! " + HELP)
    return ChatReply(reply="I can't do that yet. " + HELP)
