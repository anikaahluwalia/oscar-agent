"""Oscar's decision loop.

Classify the email, look up the policy, use what Oscar has learned, apply the
safety floor, then check the email text. Learning can only make Oscar less strict
than the policy. The floor and the email checks come after it, so they always get
the last word.
"""

from oscar.classifier import classify
from oscar.models import AutonomyLevel, Decision, Email
from oscar.policy import autonomy_for
from oscar.preferences import Preferences
from oscar.safety import ACTION_FLOORS, FLAG_ACTIONS, apply_floor, check_email, is_stricter
from oscar.voice import explain, with_evidence, working_notes

def decide(email: Email, preferences: Preferences | None = None) -> Decision:
    classification = classify(email)
    action = classification.action
    level, reason = autonomy_for(action)
    source = "policy"
    if classification.matched_pattern is None:
        # Nothing matched, so the action is only a guess. Don't act on a guess alone.
        level, reason = AutonomyLevel.ASK_FIRST, "I'm not sure what this one needs"
        source = "guess"

    learned = careful = False
    suggestion = preferences.suggest(action, level, email.sender) if preferences else None
    if suggestion:
        careful = is_stricter(suggestion[0], level)
        level, reason = suggestion
        learned = True
        source = "learned"

    before_floor = level
    level, reason = apply_floor(action, level, reason)
    if learned and level != suggestion[0]:
        learned = False  # the floor overruled what Oscar learned
    floor = ACTION_FLOORS.get(action)
    if floor and level == floor[0] and (level != before_floor or source != "learned"):
        source = "floor"
    message = explain(action, level, reason, careful)
    noticed = classification.matched_pattern

    # A risky request in the email escalates, whatever the action is.
    flags = check_email(email)
    if flags:
        for flag in flags:
            if flag.category in FLAG_ACTIONS:
                action = FLAG_ACTIONS[flag.category]
                break
        level = AutonomyLevel.ESCALATE
        source = "safety_check"
        message = f"This one's for you. {flags[0].reason}."
        noticed = flags[0].matched

    return Decision(
        email_id=email.id,
        sender=email.sender,
        subject=email.subject,
        snippet=email.body[:160],
        action=action,
        autonomy_level=level,
        matched_pattern=classification.matched_pattern,
        explanation=with_evidence(message, noticed),
        message=message,
        noticed=noticed,
        safety_flags=[flag.category for flag in flags],
        learned=learned and not flags,
        level_source=source,
        steps=working_notes(email.sender, noticed, [f.category for f in flags], source, reason, level),
    )
