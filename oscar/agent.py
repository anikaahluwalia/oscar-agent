"""Oscar's decision loop.

Classify the email, look up the policy, use what Oscar has learned, apply the
safety floor, then check the email text. Learning can only make Oscar less strict
than the policy. The floor and the email checks come after it, so they always get
the last word.
"""

from oscar.classifier import classify, is_bulk
from oscar.models import Action, AutonomyLevel, Classification, Decision, Email, SafetyCategory
from oscar.policy import autonomy_for
from oscar.preferences import HABIT_ACTIONS, Preferences
from oscar.safety import ACTION_FLOORS, FLAG_ACTIONS, apply_floor, caution, check_email, is_stricter
from oscar.understand import URGENT, Understanding
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
CONFIDENCE = {"safety_check": 0.97, "floor": 0.95, "policy": 0.75, "guess": 0.5, "caution": 0.6, "model_check": 0.85}

# Stage 11. Below this the model's reading is ignored and Oscar treats the email as a guess.
MODEL_MIN_CONFIDENCE = 0.6
# Rule actions the model's reading may replace: the ones with no safety floor. Anything floored
# (money, codes, sending, forwarding, deleting, invites) stays as the rules decided.
REPLACEABLE = frozenset({Action.MARK_READ, Action.ARCHIVE, Action.APPLY_LABEL, Action.DRAFT_REPLY})
# What a risky reading stops, and why, in Oscar's words.
MODEL_RISK: dict[str, tuple[Action | None, str]] = {
    "security_alert": (None, "It's about your account security, so you should look at it yourself"),
    "money_request": (Action.MOVE_MONEY, "It's asking for money, and I don't touch money"),
    "credential_request": (Action.SEND_CREDENTIALS, "It's asking for a password or code, and I don't share those"),
    "scam": (None, "It looks like a scam"),
    "commitment": (None, "Replying would commit you to something, and that's your call"),
    "instructions_for_ai": (None, "Someone left instructions for an AI in this email, so I'm not doing anything with it"),
}


def read_by_model(email: Email, found: Understanding, bulk_action: Action | None) -> Classification:
    """The action for what the model says the email is. Mail sent to a list never gets a reply
    drafted, whatever the model thinks, and your promotions setting applies to list mail."""
    action, rule_action = found.action, None
    if found.kind in ("question", "personal") and is_bulk(email):
        action = Action.ARCHIVE  # nobody is waiting for a reply to a list
    if action == Action.ARCHIVE and bulk_action and bulk_action != Action.ARCHIVE:
        action, rule_action = bulk_action, Action.ARCHIVE
    return Classification(action=action, matched_pattern=f"reads like {found.kind.replace('_', ' ')}",
                          email_type=found.kind, rule_action=rule_action)


def confidence_for(source: str, evidence: float = 0.0) -> float:
    """Learned levels get surer with more feedback: 0.65 with a little, up to 0.95 with 10 or more."""
    if source == "learned":
        return round(0.65 + 0.3 * min(evidence, 10) / 10, 3)
    return CONFIDENCE[source]


def decide(email: Email, preferences: Preferences | None = None, read_only: bool = False,
           bulk_action: Action | None = None, understanding: Understanding | None = None,
           model_first: bool = False) -> Decision:
    """Oscar's decision on one email. read_only only changes the wording ("I'd archive this"),
    never the level or the action.

    understanding is what the model read the email as (Stage 11), if it read it. It fills in
    when the rules found nothing (or, with model_first, replaces a rule action with no safety
    floor). A risky reading can only make him stricter. The checks still run after it.
    """
    classification = classify(email, bulk_action)
    understood_by = "rules" if classification.matched_pattern else None
    usable = understanding if understanding and understanding.confidence >= MODEL_MIN_CONFIDENCE else None
    if usable and not usable.risky and (
            classification.matched_pattern is None
            or (model_first and (classification.rule_action or classification.action) in REPLACEABLE)):
        classification = read_by_model(email, usable, bulk_action)
        understood_by = "model"
    action = classification.action
    guess = classification.matched_pattern is None
    # What you've taught Oscar for this sender's routine email (or for emails like it) carries over,
    # even when the rules picked a different low-risk action. Only for email he recognised: a habit
    # for a sender's newsletters says nothing about a notice from them he couldn't read. Safety runs after this.
    habit = (preferences.habit(email.sender, classification.email_type)
             if preferences and action in HABIT_ACTIONS and not guess else None)
    if habit and habit != action and not preferences.suggest(action, AutonomyLevel.ASK_FIRST, email.sender,
                                                             classification.email_type):
        action = habit
    level, reason = autonomy_for(action)
    if classification.rule_action:
        # A setting swapped the action (mark promos read instead of archiving): it changes what he
        # does, not how sure he is, so a new sender is still asked about first.
        rule_level, rule_reason = autonomy_for(classification.rule_action)
        if is_stricter(rule_level, level):
            level, reason = rule_level, rule_reason
    source = "policy"
    if guess:
        # Nothing matched, so the action is only a guess. Don't act on a guess alone.
        level, reason = AutonomyLevel.ASK_FIRST, "I'm not sure what this one needs"
        source = "guess"

    learned = careful = False
    # What you've taught him: this sender first, then (for easy-to-undo actions on email he
    # recognised) senders at the same domain, then emails like it. Never past notify for those.
    suggestion = (preferences.suggest(action, level, email.sender, classification.email_type, broad=not guess)
                  if preferences else None)
    if suggestion and guess and is_stricter(AutonomyLevel.PROCEED_AND_NOTIFY, suggestion.level):
        # You've okayed this for the sender, but he still couldn't tell what this email is,
        # so he does it and tells you rather than doing it quietly.
        suggestion = suggestion._replace(level=AutonomyLevel.PROCEED_AND_NOTIFY)
    if suggestion:
        careful = is_stricter(suggestion.level, level)
        level, reason = suggestion.level, suggestion.reason
        learned = True
        source = "learned"
    learned_level = level  # what learning chose, before the floor

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

    # The model read it as risky and no check caught it: stop it. This can only ever be stricter.
    risky = understanding.kind if understanding and understanding.risky and understanding.confidence >= 0.5 else None
    if risky and not flags and level != AutonomyLevel.ESCALATE:
        stop_action, why = MODEL_RISK[risky]
        action = stop_action or action
        level, source = AutonomyLevel.ESCALATE, "model_check"
        message = f"I stopped this one. {why}."
        noticed = f"reads like {risky.replace('_', ' ')}"

    # Something broken right now: not a safety risk, but it comes straight to you.
    urgent = usable.kind if usable and usable.kind in URGENT else None
    if urgent and not flags and source != "model_check" and level != AutonomyLevel.ESCALATE:
        level, source = AutonomyLevel.ESCALATE, "policy"
        reason = "it looks urgent, so I'm bringing it straight to you"
        message = explain(action, level, reason, False, read_only)

    # The backstop: an email that mentions something sensitive is never handled alone.
    sensitive = None if flags or source == "model_check" else caution(email)
    if sensitive and level in (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY):
        level, source, learned = AutonomyLevel.ASK_FIRST, "caution", False
        reason = f'it mentions "{sensitive}"'
        message = explain(action, level, reason, False, read_only)
        noticed = sensitive

    email_type = (FLAG_TYPES[flags[0].category] if flags else risky if source == "model_check"
                  else classification.email_type)
    evidence = suggestion.evidence if suggestion and source == "learned" else 0.0

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
        understood_by=understood_by,
        summary=understanding.summary if understanding else "",
    )
