"""Oscar's decision on one email.

In order: work out what kind of email it is (the keyword rules, or the model when they find
nothing), look up the policy level for the action, use what you've taught him, apply the safety
floor, then check the email text, the model's risk reading and the caution backstop. Learning can
move the level either way, but everything after it can only make him stricter, so the safety
steps always get the last word.
"""

from oscar.classification import RISKY_TYPES
from oscar.classifier import APP_ACCESS, classify, is_bulk
from oscar.models import Action, AutonomyLevel, Classification, Decision, Email, PreferenceUsed, SafetyCategory
from oscar.policy import autonomy_for
from oscar.preferences import HABIT_ACTIONS, Preferences, content_only
from oscar.safety import (ACTION_FLOORS, FLAG_ACTIONS, FLAG_LEVELS, LEVEL_ORDER, apply_floor, caution, check_email,
                          is_stricter, required_level)
from oscar.understand import URGENT, Understanding
from oscar.voice import CONFUSED, READ_ONLY_CONFUSED, explain, with_evidence, working_notes

# The kind of email a safety check means, when one fires.
FLAG_TYPES: dict[SafetyCategory, str] = {
    SafetyCategory.PROMPT_INJECTION: "prompt_injection",
    SafetyCategory.MONEY: "money_request",
    SafetyCategory.CREDENTIALS: "credential_request",
    SafetyCategory.ACCOUNT_SECURITY: "security_alert",
    SafetyCategory.SENSITIVE_DATA: "sensitive_request",
    SafetyCategory.COMMITMENT: "commitment",
    SafetyCategory.IRREVERSIBLE_DELETE: "deletion_request",
}

# How sure Oscar is that the level is right, by what decided it. Set by hand, not measured: the
# eval harness checks how well they match how often he's right (calibration, evals/scoring.py).
CONFIDENCE = {"safety_check": 0.97, "floor": 0.95, "policy": 0.75, "guess": 0.5, "caution": 0.6, "model_check": 0.85}

# Below this the model's reading (Stage 11) is ignored, and an email the rules didn't match stays a guess.
MODEL_MIN_CONFIDENCE = 0.6
# Rule actions the model's reading may replace: the ones with no safety floor. Anything floored
# (money, codes, sending, forwarding, unsubscribing, deleting, invites) stays as the rules decided.
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
    drafted, whatever the model thinks. bulk_action swaps archive for list mail, as in classify()."""
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
           model_first: bool = False, *, safety: bool = True, type_hint: str | None = None) -> Decision:
    """Oscar's decision on one email. read_only only changes the wording ("I'd archive this"),
    never the level or the action.

    understanding is what the model read the email as (Stage 11), if it read it. It fills in
    when the rules found nothing (or, with model_first, replaces a rule action with no safety
    floor). A risky reading can only make him stricter. The checks still run after it.

    type_hint is what you said this sender's emails are (classification.type_hints). It changes
    only what kind of email he takes it for, so which "emails like this" rule applies; never the
    action, and never for a risky kind. The safety checks still run on the email afterwards.

    safety=False skips the floor, the email checks, the model's risk reading and the caution
    backstop. It's only for measuring what they add, in the simulated inbox: inbox.sync refuses it
    for a real Gmail, and the app never passes it.
    """
    if content_only(email.sender):
        type_hint = None  # judged on what it says: what you said this sender's emails are doesn't count
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
    # You told him what this sender's emails are. Only over a routine reading he recognised: a
    # guess still asks, and a risky reading (or a risky correction) is never replaced.
    from_you = bool(type_hint and not guess and type_hint != classification.email_type
                    and type_hint not in RISKY_TYPES and classification.email_type not in RISKY_TYPES)
    if from_you:
        classification = classification.model_copy(update={"email_type": type_hint})
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
        # bulk_action swapped the action (mark promos read instead of archiving): it changes what he
        # does, not how sure he is, so a new sender is still asked about first.
        rule_level, rule_reason = autonomy_for(classification.rule_action)
        if is_stricter(rule_level, level):
            level, reason = rule_level, rule_reason
    source = "policy"
    if guess:
        # Nothing matched, so the action is only a guess. Don't act on a guess alone.
        level, reason = AutonomyLevel.ASK_FIRST, "I'm not sure what this one needs"
        source = "guess"
    elif level == AutonomyLevel.PROCEED_SILENTLY and action == Action.MARK_READ \
            and APP_ACCESS.search(f"{email.subject}\n{email.body}"):
        # An app now has access to your account. Nothing to stop, but he tells you, so you'd spot one
        # you didn't connect. What you teach him (below) can still make it quiet.
        level, reason = AutonomyLevel.PROCEED_AND_NOTIFY, ("it's only a notice. An app now has access to your account, "
                                                         "so I'm telling you in case it wasn't you")

    learned = careful = False
    # What you've taught him: this sender first, then (for easy-to-undo actions on email he
    # recognised) senders at the same domain, then emails like it. A domain never goes past notify.
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
    if safety:
        level, reason = apply_floor(action, level, reason)
    if learned and level != learned_level:
        learned = False  # the floor overruled what Oscar learned
    floor = ACTION_FLOORS.get(action)
    if floor and level == floor[0] and (level != before_floor or source != "learned"):
        source = "floor"
    message = explain(action, level, reason, careful, read_only)
    noticed = classification.matched_pattern

    # A risky request in the email holds him back, whatever the action is and whatever he learned:
    # the level becomes the stricter of what he chose and what the check requires (FLAG_LEVELS).
    flags = check_email(email) if safety else []
    required = required_level(flags)
    lead = next((f for f in flags if FLAG_LEVELS[f.category] == required), None)  # the check that sets the level
    # When the protected rule for this action already stopped it (money, credentials), the
    # check only agrees: keep the rule as the reason. Otherwise the check is what holds it back.
    already_floored = source == "floor" and level == AutonomyLevel.ESCALATE and all(
        FLAG_ACTIONS.get(f.category) == action for f in flags if f.category in FLAG_ACTIONS)
    if flags and not already_floored:
        # What was really asked for (paying, a password, deleting for good), so the decision says it.
        named = next((f for f in flags if f.category in FLAG_ACTIONS), None)
        if named and not is_stricter(level, FLAG_LEVELS[named.category]):
            # Only when that check is at least as strict as what already holds it back: a money stop
            # that also says "delete this permanently" stays a money stop.
            action = FLAG_ACTIONS[named.category]
        elif usable and MODEL_RISK.get(usable.kind, (None,))[0]:
            # A check stopped it for another reason ("bank details"), and the model read it as asking
            # for money or a password: say that's what was asked for.
            action = MODEL_RISK[usable.kind][0]
        if not is_stricter(level, required):  # it sets the level, or agrees with it: it's the reason
            level, source = required, "safety_check"
            message = (f"I stopped this one. {lead.reason}." if level == AutonomyLevel.ESCALATE
                       else explain(action, level, lead.reason[0].lower() + lead.reason[1:], False, read_only))
            noticed = lead.matched.strip(" .,;:!?-•*(\n")  # without the punctuation that started the clause

    # The model read it as risky and no check caught it: stop it. This can only ever be stricter.
    risky = (understanding.kind if safety and understanding and understanding.risky and understanding.confidence >= 0.5
             else None)
    if risky and level != AutonomyLevel.ESCALATE:  # a check that only asks can't hide a risky reading
        stop_action, why = MODEL_RISK[risky]
        action = stop_action or action
        level, source = AutonomyLevel.ESCALATE, "model_check"
        message = f"I stopped this one. {why}."
        noticed = f"reads like {risky.replace('_', ' ')}"

    # Something broken right now: not a safety risk, but it comes straight to you.
    urgent = usable.kind if usable and usable.kind in URGENT else None
    if urgent and source != "model_check" and level != AutonomyLevel.ESCALATE:  # the stricter level wins, check or not
        level, source = AutonomyLevel.ESCALATE, "policy"
        reason = "it looks urgent, so I'm bringing it straight to you"
        message = explain(action, level, reason, False, read_only)

    # The backstop: an email that mentions something sensitive is never handled alone.
    sensitive = None if flags or source == "model_check" or not safety else caution(email)
    if sensitive and level in (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY):
        level, source, learned = AutonomyLevel.ASK_FIRST, "caution", False
        reason = f'it mentions "{sensitive}"'
        message = explain(action, level, reason, False, read_only)
        noticed = sensitive

    # He couldn't tell what this is and nothing you taught him covers it: say so, rather than
    # asking about a guess.
    if source == "guess" and level == AutonomyLevel.ASK_FIRST:
        message = READ_ONLY_CONFUSED if read_only else CONFUSED

    # The least involvement the safety rules allow here, and the rule that set the level, if one did.
    floor = ACTION_FLOORS.get(action)
    floors = [lvl for lvl in (required, floor[0] if floor else None) if lvl]
    safety_floor = (AutonomyLevel.ESCALATE if source == "model_check"
                    else max(floors, key=LEVEL_ORDER.index) if floors else None)
    safety_rule = (message.removeprefix("I stopped this one. ").rstrip(".") if source == "model_check"
                   else lead.reason if source == "safety_check" and flags else floor[1] if source == "floor" and floor
                   else lead.reason if flags else reason if source == "caution" else None)

    email_type = (risky if source == "model_check" else FLAG_TYPES[lead.category] if flags and source == "safety_check"
                  else classification.email_type)
    evidence = suggestion.evidence if suggestion and source == "learned" else 0.0
    used = (PreferenceUsed(scope=suggestion.scope, evidence=suggestion.evidence, confidence=suggestion.confidence)
            if suggestion and learned and source == "learned" else None)
    factors = _factors(email, guess, email_type, preferences, used, suggestion.reason if used else None,
                       safety_rule, safety_floor)
    type_from_you = from_you and email_type == type_hint  # a safety check can still replace it
    if type_from_you:
        factors.insert(1, "You told me what this sender's emails are")

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
        factors=factors,
        safety_floor=safety_floor,
        safety_rule=safety_rule,
        caution=sensitive,
        preference=used,
        type_from_you=type_from_you,
    )


def _factors(email: Email, guess: bool, email_type: str, preferences: Preferences | None, used: PreferenceUsed | None,
             learned_reason: str | None, safety_rule: str | None, safety_floor: AutonomyLevel | None) -> list[str]:
    """A few plain words on what mattered, for the UI. Facts only, never his working-out."""
    out = ["I couldn't tell what kind of email this is" if guess and not safety_rule
           else f"Reads like {email_type.replace('_', ' ')}"]
    out.append("A sender you've taught me about" if preferences and preferences.knows(email.sender)
               else "A sender I haven't learned about yet")
    if used and learned_reason:
        out.append(f"{learned_reason[0].upper()}{learned_reason[1:]} ({int(used.confidence * 100 + 0.5)}% sure)")  # rounds like the app
    if safety_rule:
        out.append(f"Safety rule: {safety_rule}")
    elif safety_floor == AutonomyLevel.ASK_FIRST:
        out.append("The safety rules say I ask first for this")
    return out
