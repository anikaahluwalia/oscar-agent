"""Replaying today's Oscar on your real emails.

Each real decision is graded against the version of Oscar that made it, so on its own that can't
tell you whether a fix helped. replay() reads again every real email you've answered in Review (or
in a safety review), decides on it with the current Oscar, and grades the new call against your
answer. Before and now are graded on the very same emails, so two versions can be compared.

It only reads. The Gmail client is made read-only here, whatever it's given, and nothing is added
to the history, so a replay never changes what the app shows or what Oscar learns. An email never
learns from what you said about it (skip_email), since that's what it's graded against. The result
is saved in the account's own folder, never in the repo: ids and levels only, no email text.
"""

import json
import time
from collections.abc import Callable

from oscar.agent import decide
from oscar.classification import type_hints
from oscar.cold_start import MAX_REFUSED_IN_A_ROW, PACE, patiently, skippable
from oscar.gmail import GmailClient, GmailError, parse_message
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision, now
from oscar.preferences import Preferences
from oscar.review import Answer, Review, answer_for, grade_all, grade_answer, teaching
from oscar.safety_review import Verdict, is_safety_stop
from oscar.understand import Reader
from oscar.version import policy_version

PROGRESS_EVERY = 25  # emails between progress lines, so a long replay doesn't look stuck
_sleep = time.sleep  # tests swap this so they don't wait


def targets(history: History) -> list[tuple[Decision, tuple[Review, Answer] | None, Verdict | None]]:
    """Every real email with a full answer or a safety review, oldest first, as (Oscar's first call
    on it, your answer, your safety verdict). The first call is the "before": re-reads by a newer
    Oscar are left out, like in the review results."""
    first: dict[str, Decision] = {}
    for d in sorted(history.decisions.values(), key=lambda d: d.created_at):
        if d.source == "gmail" and (d.email_id not in first or (first[d.email_id].recheck_of and not d.recheck_of)):
            first[d.email_id] = d
    verdicts: dict[str, Verdict] = {}
    for r in sorted(history.safety_reviews, key=lambda r: r.reviewed_at):  # your latest word on each email stands
        d = history.get_decision(r.decision_id)
        if d is not None and d.source == "gmail":
            verdicts[d.email_id] = r.verdict
    out = []
    for email_id, before in first.items():
        found, verdict = answer_for(history, before), verdicts.get(email_id)
        if found or verdict:
            out.append((before, found, verdict))
    return out


def replay(history: History, gmail: GmailClient, reader: Reader | None = None, limit: int | None = None,
           say: Callable[[str], None] = print) -> dict:
    """Decide again on your answered real emails with the current Oscar, and grade before and now.
    limit keeps the newest that many. The result is saved in the account's folder and returned."""
    gmail = GmailClient(gmail.tokens, gmail.http, names=gmail.names, read_only=True)
    every = targets(history)
    todo = every[-limit:] if limit and limit < len(every) else every
    version = policy_version()
    say(f"Reading {len(todo)} emails from Gmail...")
    rows, before_rows, now_rows, gone, refused = [], [], [], [], 0
    for i, (before, found, verdict) in enumerate(todo, 1):
        if i % PROGRESS_EVERY == 0:
            say(f"  {i} of {len(todo)}")
        try:
            email, _ = parse_message(patiently(lambda: gmail.message(before.email_id)))
            refused = 0
        except GmailError as e:
            # Deleted since, or Gmail won't show it: skipped, and kept so it's clear what wasn't
            # checked. Anything else (not connected, an outage, many refusals in a row) stops the run.
            refused = refused + 1 if e.status == 403 else 0
            if not skippable(e) or refused >= MAX_REFUSED_IN_A_ROW:
                raise
            gone.append({"email_id": before.email_id, "decision_id": before.id, "safety_review": verdict})
            continue
        _sleep(PACE)
        # Only what you taught him about other emails: this one's answer is what he's graded against.
        prefs = Preferences.from_feedback(teaching(history, skip_email=before.email_id))
        call = decide(email, prefs, read_only=True, understanding=reader.read(email) if reader else None,
                      type_hint=type_hints(history, skip_email=before.email_id).get(email.sender))
        row = {"email_id": before.email_id, "decision_id": before.id, "before": _call(before), "now": _call(call),
               "answer": None, "moved": None, "safety_review": verdict}
        if found:
            review, right = found
            before_rows.append((before, right, review.why))
            now_rows.append((call, right, review.why))
            row["answer"] = {"level": right.level.value, "action": _value(right.action)}
            row["before"]["grade"], row["now"]["grade"] = (grade_answer(right, d.autonomy_level, d.action)[0]
                                                           for d in (before, call))
            row["moved"] = _moved(right, before, call)
        rows.append(row)

    # A wrong stop is fixed when no safety rule stops it now. A real risk is kept safe only while
    # it still comes straight to you; anything less is the first thing to look at. Ones Gmail no
    # longer has are listed apart, so "all still stopped" never hides ones that weren't checked.
    wrong = [r for r in rows if r["safety_review"] == "MISCLASSIFIED"]
    risks = [r for r in rows if r["safety_review"] == "RISK_CORRECT"]
    unread = lambda verdict: [g["email_id"] for g in gone if g["safety_review"] == verdict]  # noqa: E731
    result = {
        "version": version,
        "model": reader.reads if reader else "off",
        "replayed_at": now().isoformat(),
        "emails": len(todo),
        "read": len(rows),
        "skipped": len(gone),
        "not_read": gone,
        # Graded on the same emails, the ones read again that have a full answer.
        "before": grade_all(before_rows),
        "now": grade_all(now_rows),
        "wrong_stops": {"of": len(wrong), "still_stopped": sum(r["now"]["safety_stop"] for r in wrong),
                        "not_read": unread("MISCLASSIFIED")},
        "real_risks": {"of": len(risks), "still_stopped": sum(r["now"]["level"] == AutonomyLevel.ESCALATE.value for r in risks),
                       "not_stopped": [r["email_id"] for r in risks if r["now"]["level"] != AutonomyLevel.ESCALATE.value],
                       "not_read": unread("RISK_CORRECT")},
        "per_email": rows,
    }
    # Saved by version, so runs can be compared. A run that read nothing isn't saved, and one
    # cut short by limit gets its own name, so neither replaces a full run.
    if history.data_dir is not None and rows:
        folder = history.data_dir / "replays"
        folder.mkdir(parents=True, exist_ok=True)
        name = version + ("" if reader else "-rules-only") + (f"-newest-{len(todo)}" if len(todo) < len(every) else "")
        path = folder / f"{name}.json"
        path.write_text(json.dumps(result, indent=2))
        result["saved_to"] = str(path)
    return result


def _call(d: Decision) -> dict:
    return {"level": d.autonomy_level.value, "action": d.action.value, "safety_stop": is_safety_stop(d)}


def _value(action: Action | str | None) -> str | None:
    return action.value if isinstance(action, Action) else action


def _moved(right: Answer, before: Decision, call: Decision) -> str | None:
    """Whether the call on this email got better or worse against your answer. Right beats wrong;
    between two wrong calls, the cheaper mistake (oscar/grading.py) is better."""
    was, is_ = (grade_answer(right, d.autonomy_level, d.action) for d in (before, call))
    rank = lambda g: (g[0] != "none", g[1])  # noqa: E731
    if rank(is_) < rank(was):
        return "better"
    if rank(is_) > rank(was):
        return "worse"
    return "changed" if is_[0] != was[0] else None
