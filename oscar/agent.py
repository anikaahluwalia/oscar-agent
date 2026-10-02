"""Oscar's decision loop.

Classify the email, look up the policy, use what Oscar has learned, apply the
safety floor, then check the email text. Learning can only make Oscar less strict
than the policy. The floor and the email checks come after it, so they always get
the last word.
"""

from oscar.classifier import classify
from oscar.models import Action, AutonomyLevel, Decision, Email, SafetyCategory
from oscar.policy import autonomy_for
from oscar.preferences import HABIT_ACTIONS, Preferences
from oscar.safety import ACTION_FLOORS, FLAG_ACTIONS, apply_floor, caution, check_email, is_stricter
from oscar.voice import explain, with_evidence, working_notes

# The kind of email a safety check means, when one fires.
FLAG_TYPES: dict[SafetyCategory, str] = {
    SafetyCategory.PROMPT_INJECTION: "prompt_injection",
    SafetyCategory.MONEY: "money_request",
    SafetyCategory.CREDENTIALS: "credential_request",
    SafetyCategory.ACCOUNT_SECURITY: "security_alert",
    SafetyCategory.SENSITIVE_DATA: "sensitive_request",
    SafetyCategory.COMMITMENT: "commitment",
}

# How sure Oscar is that the level is right, by what decided it. These are starting
# values, not measured ones: the eval harness checks them (calibration) on held-out
# data, and any adjustment is fitted on the learning set only.
CONFIDENCE = {"safety_check": 0.97, "floor": 0.95, "policy": 0.75, "guess": 0.5, "caution": 0.6}


def confidence_for(source: str, evidence: float = 0.0) -> float:
    """Learned levels get surer with more feedback: 0.65 with a little, up to 0.95 with 10 or more."""
    if source == "learned":
        return round(0.65 + 0.3 * min(evidence, 10) / 10, 3)
    return CONFIDENCE[source]


def decide(email: Email, preferences: Preferences | None = None, read_only: bool = False,
           bulk_action: Action | None = None) -> Decision:
    """Oscar's decision on one email. read_only only changes the wording ("I'd archive this"),
    never the level or the action."""
    classification = classify(email, bulk_action)
    action = classification.action
    # What you've taught Oscar for this sender's routine email carries over, even when the rules
    # picked a different low-risk action. Safety checks still run after this.
    habit = preferences.habit(email.sender) if preferences and action in HABIT_ACTIONS else None
    if habit and habit != action and not preferences.by_key.get((email.sender, action)):
        action = habit
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

    # A kind-of-email habit, for a sender Oscar hasn't learned anything about: if you've okayed
    # the same low-risk action for newsletters (say) from several senders, he does it for a new
    # one too, but tells you, since it's a new sender. Never quietly, and safety still runs after.
    kind_habit = None
    if (preferences and preferences.policy.kind_habits and not suggestion and not preferences.knows(email.sender)
            and action in HABIT_ACTIONS):
        kind_habit = preferences.kind_habit(classification.email_type)
    if kind_habit and is_stricter(level, AutonomyLevel.PROCEED_AND_NOTIFY):
        action, senders = kind_habit
        level, reason = AutonomyLevel.PROCEED_AND_NOTIFY, f"you've okayed this for emails like it from {senders} senders"
        learned, source = True, "learned"
    learned_level = level  # what learning (by sender or kind of email) chose, before the floor

    before_floor = level
    level, reason = apply_floor(action, level, reason)
    if learned and level != learned_level:
        learned = False  # the floor overruled what Oscar learned
    floor = ACTION_FLOORS.get(action)
    if floor and level == floor[0] and (level != before_floor or source != "learned"):
        source = "floor"
    message = explain(action, level, reason, careful, read_only)
    noticed = classification.matched_pattern

    # A risky request in the email escalates, whatever the action is.
    flags = check_email(email)
    # When the protected rule for this action already stopped it (money, credentials), the
    # check only agrees: keep the rule as the reason. Otherwise the check is what stops it.
    already_floored = source == "floor" and level == AutonomyLevel.ESCALATE and all(
        FLAG_ACTIONS.get(f.category) == action for f in flags if f.category in FLAG_ACTIONS)
    if flags and not already_floored:
        for flag in flags:
            if flag.category in FLAG_ACTIONS:
                action = FLAG_ACTIONS[flag.category]
                break
        level = AutonomyLevel.ESCALATE
        source = "safety_check"
        message = f"I stopped this one. {flags[0].reason}."
        noticed = flags[0].matched

    # The backstop: an email that mentions something sensitive is never handled alone.
    sensitive = None if flags else caution(email)
    if sensitive and level in (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY):
        level, source, learned = AutonomyLevel.ASK_FIRST, "caution", False
        reason = f'it mentions "{sensitive}"'
        message = explain(action, level, reason, False, read_only)
        noticed = sensitive

    email_type = FLAG_TYPES[flags[0].category] if flags else classification.email_type
    evidence = preferences.get(action, email.sender).evidence if preferences and source == "learned" else 0.0

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
        steps=working_notes(email.sender, noticed, [f.category for f in flags], source, reason, level, read_only),
        email_type=email_type,
        confidence=confidence_for(source, evidence),
    )
