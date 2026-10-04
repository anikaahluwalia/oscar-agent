"""What you tell Oscar about his decisions: the buttons in the app and rules from the chat.

This file checks and saves it; oscar/preferences.py turns it into what he learns. Feedback can't
get around the safety floor: asking for more ("always do this", Just handle them, Handle + tell me)
on a risky decision is saved but marked blocked_by_floor, Oscar says why, and learning skips it.
"""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision, new_id, now
from oscar.safety import ACTION_FLOORS
from oscar.voice import ACTION_PHRASES


class FeedbackKind(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    UNDO = "UNDO"
    EDIT_THEN_SEND = "EDIT_THEN_SEND"
    ALWAYS_DO_THIS = "ALWAYS_DO_THIS"
    ALWAYS_ASK_ME = "ALWAYS_ASK_ME"
    SEEN = "SEEN"  # "got it" on an email Oscar brought to you; it teaches him nothing
    FORGET = "FORGET"  # forget what he's learned for this sender and action, and start fresh
    # What one of your Review answers teaches (oscar/review.py lessons). Made from your reviews
    # only, never sent to the API: desired_level says what the level should have been.
    REVIEW = "REVIEW"
    # How much you want him to do on his own with emails like this one, said outright. Approving
    # only says the action was right; these are the only buttons that say how much to ask.
    JUST_HANDLE_IT = "JUST_HANDLE_IT"
    HANDLE_AND_TELL_ME = "HANDLE_AND_TELL_ME"
    KEEP_ASKING = "KEEP_ASKING"


class Learned(str, Enum):
    """Every kind of feedback, as what it says about Oscar's call (normalize below)."""

    CORRECT = "CORRECT"
    ACTION_ONLY = "ACTION_ONLY"  # the action was right (or wrong); nothing about how much to ask
    SHOULD_BE_SILENT = "SHOULD_BE_SILENT"
    SHOULD_NOTIFY = "SHOULD_NOTIFY"
    SHOULD_ASK = "SHOULD_ASK"
    SHOULD_ESCALATE = "SHOULD_ESCALATE"
    WRONG_ACTION = "WRONG_ACTION"  # kept apart from the level: it doesn't move his autonomy
    WRONG_CLASSIFICATION = "WRONG_CLASSIFICATION"  # the kind of email was wrong; nothing to learn about autonomy
    SKIP = "SKIP"  # teaches nothing


class FeedbackEvent(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=now)
    decision_id: str
    kind: FeedbackKind
    # Copied from the decision so the feedback log makes sense on its own.
    action: Action
    autonomy_level: AutonomyLevel
    sender: str
    email_type: str = "unknown"  # what kind of email it was, so habits can carry over to similar emails
    edited_text: str | None = None
    # True when the user asked for more autonomy than the safety floor allows.
    blocked_by_floor: bool = False
    # How much you said he should ask (a Review answer, or Just handle them / Handle and tell me /
    # Keep asking), or for an "emails like this" rule, the level it sets. None: you didn't say.
    desired_level: AutonomyLevel | None = None
    # Whether the action was the right one for this email: Approve and Review's "Yes" say yes, Decline says
    # no. Kept apart from desired_level, so approving never counts as "you can stop asking".
    action_feedback: Literal["CORRECT", "INCORRECT"] | None = None
    # Who a rule ("always do this", "always ask me", forget) is about: this sender, or every email
    # of this kind (only for archive, mark as read and label). Everything else is about the sender.
    scope: Literal["sender", "kind"] = "sender"
    # Where it came from. Only you can teach Oscar: email text never becomes feedback.
    provenance: str = "USER_FEEDBACK"


# Your answer to "for emails like this", and the level it asks for.
CHOICES: dict[FeedbackKind, AutonomyLevel] = {
    FeedbackKind.JUST_HANDLE_IT: AutonomyLevel.PROCEED_SILENTLY,
    FeedbackKind.HANDLE_AND_TELL_ME: AutonomyLevel.PROCEED_AND_NOTIFY,
    FeedbackKind.KEEP_ASKING: AutonomyLevel.ASK_FIRST,
}


SHOULD = {
    AutonomyLevel.PROCEED_SILENTLY: Learned.SHOULD_BE_SILENT,
    AutonomyLevel.PROCEED_AND_NOTIFY: Learned.SHOULD_NOTIFY,
    AutonomyLevel.ASK_FIRST: Learned.SHOULD_ASK,
    AutonomyLevel.ESCALATE: Learned.SHOULD_ESCALATE,
}


def normalize(event: FeedbackEvent) -> Learned:
    """What a piece of feedback says about how much Oscar should ask, whichever button or answer
    it came from.

    Only an answer that says the level counts: Just handle them, Handle and tell me, Keep asking,
    or a Review answer with a level. Approving, and "Yes" in Review, only say the action was
    right (ACTION_ONLY): they never mean "stop asking", and never "keep asking". A no or an undo
    says he'd have been wrong to do it alone, so he should have asked. "Always" rules, Forget and
    "got it" are rules or nothing, so they read as CORRECT or SKIP here.
    """
    if event.kind in CHOICES:
        return SHOULD[CHOICES[event.kind]]
    if event.kind in (FeedbackKind.APPROVE, FeedbackKind.EDIT_THEN_SEND):
        return Learned.ACTION_ONLY
    if event.kind in (FeedbackKind.REJECT, FeedbackKind.UNDO):
        return Learned.SHOULD_ASK
    if event.kind == FeedbackKind.REVIEW:
        return SHOULD[event.desired_level] if event.desired_level else Learned.ACTION_ONLY
    if event.kind == FeedbackKind.SEEN:
        return Learned.SKIP
    return Learned.CORRECT


def action_verdict(event: FeedbackEvent) -> Literal["CORRECT", "INCORRECT"] | None:
    """Whether this feedback said the action was right. Older lines have no action_feedback, so it's
    worked out from the kind."""
    if event.action_feedback:
        return event.action_feedback
    if event.kind in (FeedbackKind.APPROVE, FeedbackKind.EDIT_THEN_SEND):
        return "CORRECT"
    if event.kind == FeedbackKind.REJECT:
        return "INCORRECT"
    return None


class FeedbackError(ValueError):
    pass


REPLIES: dict[FeedbackKind, str] = {
    FeedbackKind.APPROVE: "Done! One less thing.",
    FeedbackKind.REJECT: "Okay! I left it alone.",
    FeedbackKind.UNDO: "Put it back! My mistake, I'll be more careful with these.",
    FeedbackKind.EDIT_THEN_SEND: "Sent with your changes! I'll pay attention to how you write these.",
    FeedbackKind.ALWAYS_DO_THIS: "Got it! I'll start taking care of these for you.",
    FeedbackKind.ALWAYS_ASK_ME: "You got it! I'll always check with you on these.",
    FeedbackKind.SEEN: "Okay! It's all yours.",
    FeedbackKind.FORGET: "Okay, I've forgotten that. I'll start fresh with this sender.",
    FeedbackKind.REVIEW: "Thanks! I'll remember that.",
    FeedbackKind.JUST_HANDLE_IT: "Got it! I'll just handle these from now on.",
    FeedbackKind.HANDLE_AND_TELL_ME: "Got it! I'll handle these and let you know.",
    FeedbackKind.KEEP_ASKING: "You got it! I'll keep checking with you on these.",
}

# The same, for a rule about every email of this kind.
KIND_REPLIES: dict[FeedbackKind, str] = {
    FeedbackKind.ALWAYS_DO_THIS: "Got it! I'll just handle emails like this. Anything risky still comes to you.",
    FeedbackKind.ALWAYS_ASK_ME: "You got it! I'll check with you on emails like this.",
    FeedbackKind.FORGET: "Okay, I've forgotten that rule for emails like this.",
}

OSCAR_ACTED = {AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY}
REPLY_ACTIONS = {Action.DRAFT_REPLY, Action.SEND_REPLY}


# Change nothing in Gmail: they only teach him (or make him forget).
TEACHING_ONLY = {FeedbackKind.ALWAYS_DO_THIS, FeedbackKind.ALWAYS_ASK_ME, FeedbackKind.FORGET, *CHOICES}
ASKS_FOR_MORE = {FeedbackKind.ALWAYS_DO_THIS, FeedbackKind.JUST_HANDLE_IT, FeedbackKind.HANDLE_AND_TELL_ME}


def check_allowed(decision: Decision, kind: FeedbackKind, edited_text: str | None, undoable: bool = False) -> None:
    """Whether this feedback makes sense for this decision. undoable: Oscar did something in Gmail
    for it that hasn't been undone (Stage 12, or in a demo's pretend Gmail), so undo is allowed
    whatever the level."""
    if kind == FeedbackKind.REVIEW:
        raise FeedbackError("Answer on the Review page instead.")  # lessons come from your reviews only
    if kind in CHOICES and decision.autonomy_level == AutonomyLevel.ESCALATE:
        raise FeedbackError("I bring these straight to you, so there's nothing to teach me here.")
    if kind == FeedbackKind.FORGET or (decision.source == "gmail" and kind in TEACHING_ONLY) or kind in CHOICES:
        return  # these only teach him (or make him forget); they're fine on any email
    if kind == FeedbackKind.UNDO and (decision.source == "gmail" or undoable):
        if not undoable:
            raise FeedbackError("I didn't do anything in Gmail with that one, so there's nothing to undo.")
        return
    if decision.source == "gmail" and kind == FeedbackKind.EDIT_THEN_SEND:
        raise FeedbackError("I never send email from your Gmail. Reply there yourself.")
    if decision.source == "gmail" and not decision.acting:
        # Made while Oscar only read the inbox: he didn't do anything, so there's nothing to
        # approve or undo. Reviewing is how you answer these.
        raise FeedbackError("I'm only reading your real inbox for now, so there's nothing to approve or undo. Review it instead.")
    level = decision.autonomy_level
    if kind == FeedbackKind.APPROVE and level not in (AutonomyLevel.ASK_FIRST, AutonomyLevel.PROCEED_AND_NOTIFY):
        raise FeedbackError("I only need an okay on things I asked about or told you about.")
    if kind == FeedbackKind.REJECT and level != AutonomyLevel.ASK_FIRST:
        raise FeedbackError("I only need a yes or no on things I asked you about.")
    if kind == FeedbackKind.UNDO and level not in OSCAR_ACTED:
        raise FeedbackError("I didn't do anything with that one, so there's nothing to undo.")
    if kind == FeedbackKind.SEEN and level != AutonomyLevel.ESCALATE:
        raise FeedbackError("Got it is only for emails I brought to you.")
    if kind == FeedbackKind.EDIT_THEN_SEND:
        if level == AutonomyLevel.ESCALATE:
            raise FeedbackError("I'm not sending anything on this one. You'll need to reply yourself.")
        if decision.action not in REPLY_ACTIONS:
            raise FeedbackError("Edit then send only works on replies.")
        if not edited_text:
            raise FeedbackError("I need the edited text to send.")


def floor_reply(decision: Decision) -> str | None:
    """Oscar's reply when "always do this" would go below the floor, else None."""
    if decision.autonomy_level == AutonomyLevel.ESCALATE or decision.safety_flags:
        return "I'll always bring these to you. Some things I'm not going to guess on."
    floor = ACTION_FLOORS.get(decision.action)
    if floor:
        return f"I'll keep checking with you before I {ACTION_PHRASES[decision.action]}, since {floor[1]}."
    return None


def check_kind_rule(decision: Decision, kind: FeedbackKind, desired: AutonomyLevel | None) -> None:
    """A rule for every email of this kind: only for the easy-to-undo actions, only for a kind of
    email Oscar recognised, and "always do this" only as quietly or with a heads up."""
    from oscar.preferences import HABIT_ACTIONS, family  # here: preferences imports this module

    if kind not in KIND_REPLIES:
        raise FeedbackError("Only always do this, always ask me and forget can be about every email like this.")
    if decision.action not in HABIT_ACTIONS or not family(decision.email_type):
        raise FeedbackError("I can only learn that for archiving, marking as read or labelling an email I recognised.")
    if decision.autonomy_level == AutonomyLevel.ESCALATE or decision.safety_flags:
        raise FeedbackError("I bring these straight to you, so there's no rule to set here.")
    if kind == FeedbackKind.ALWAYS_DO_THIS and desired not in (None, AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY):
        raise FeedbackError("A rule to handle emails like this is either quietly or with a heads up.")


def record_feedback(
    history: History, decision_id: str, kind: FeedbackKind, edited_text: str | None = None, undoable: bool = False,
    *, scope: Literal["sender", "kind"] = "sender", desired_level: AutonomyLevel | None = None,
) -> tuple[FeedbackEvent, str]:
    """Save one piece of feedback. scope "kind" makes a rule about every email like this one;
    desired_level is the level that rule sets (quietly unless you say so)."""
    decision = history.get_decision(decision_id)
    if decision is None:
        raise FeedbackError(f"I can't find decision {decision_id}.")
    check_allowed(decision, kind, edited_text, undoable)
    if scope == "kind":
        check_kind_rule(decision, kind, desired_level)
    reply = KIND_REPLIES[kind] if scope == "kind" else REPLIES[kind]
    if kind == FeedbackKind.APPROVE and decision.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY:
        reply = "Thanks! Good to know I got that one right."
    blocked = False
    if kind in ASKS_FOR_MORE:
        blocked_reply = floor_reply(decision)
        if blocked_reply:
            reply, blocked = blocked_reply, True
    if kind in CHOICES:
        desired = CHOICES[kind]
    elif scope == "kind" and kind == FeedbackKind.ALWAYS_DO_THIS:
        desired = desired_level or AutonomyLevel.PROCEED_SILENTLY
    else:
        desired = None
    verdict = ("CORRECT" if kind in (FeedbackKind.APPROVE, FeedbackKind.EDIT_THEN_SEND)
               else "INCORRECT" if kind == FeedbackKind.REJECT else None)
    event = FeedbackEvent(
        decision_id=decision.id,
        kind=kind,
        action=decision.action,
        autonomy_level=decision.autonomy_level,
        sender=decision.sender,
        email_type=decision.email_type,
        edited_text=edited_text,
        blocked_by_floor=blocked,
        desired_level=desired,
        action_feedback=verdict,
        scope=scope,
    )
    history.add_feedback(event)
    return event, reply
