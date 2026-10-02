"""Command line for Oscar.

    python -m oscar                                 decide on every email in emails/
    python -m oscar decide emails/newsletter.json   decide on one email
    python -m oscar feedback <decision_id> APPROVE  give feedback on a decision
    python -m oscar feedback <decision_id> EDIT_THEN_SEND --text "Sure, Thursday works."
    python -m oscar learned                         show what Oscar has learned
    python -m oscar reviews                         real inbox: how Oscar did, and where you disagreed
"""

import argparse
import json
import sys
from pathlib import Path

from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.history import History, default_data_dir, real_inbox_dir
from oscar.models import Action, Email
from oscar.preferences import Preferences
from oscar.review import OTHER_ACTION, REVIEW_LABEL_NAMES, ReviewLabel, answer_for, summary
from oscar.voice import describe_learning

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "emails"


def run_decide(history: History, files: list[str]) -> None:
    paths = [Path(p) for p in files] or sorted(DEFAULT_DIR.glob("*.json"))
    for path in paths:
        email = Email.model_validate_json(path.read_text())
        decision = decide(email, Preferences.from_feedback(history.feedback))
        history.add_decision(decision)
        print(f"── {email.id}  (decision {decision.id})")
        print(f"   From:    {email.sender}")
        print(f"   Subject: {email.subject}")
        print(f"   Oscar:   {decision.action.value} → {decision.autonomy_level.value}")
        print(f"            {decision.explanation}")
        print()


def run_feedback(history: History, decision_id: str, kind: str, text: str | None) -> int:
    try:
        _, reply = record_feedback(history, decision_id, FeedbackKind(kind.upper()), text)
    except FeedbackError as e:
        print(f"Oscar: {e}")
        return 1
    print(f"Oscar: {reply}")
    return 0


def run_learned(history: History) -> None:
    rows = Preferences.from_feedback(history.feedback).summary()
    if not rows:
        print("Oscar: I haven't learned anything yet. Give me some feedback first.")
        return
    print("Oscar: Here's what I've learned.")
    for row in rows:
        print(f"  - {describe_learning(row)}")


def run_reviews(history: History) -> None:
    """The review summary and every disagreement, to turn into regression tests (evals/regression_cases/)."""
    s = summary(history)
    if not s["decisions"]:
        print("No real-inbox decisions yet. Connect Gmail in the app and check for new email.")
        return
    agreement = "n/a" if s["agreement"] is None else f"{s['agreement'] * 100:.0f}%"
    print(f"{s['decisions']} decisions, {s['reviewed']} reviewed, agreement {agreement} (skips don't count)")
    for label, n in s["labels"].items():
        if n:
            print(f"  {REVIEW_LABEL_NAMES[ReviewLabel(label)]}: {n}")
    for version, v in s["by_version"].items():
        va = "n/a" if v["agreement"] is None else f"{v['agreement'] * 100:.0f}%"
        print(f"  version {version}: {v['scored']} scored, agreement {va}")
    g = s["graded"]
    if g.get("held_back"):
        print(f"  {s['old_way']} reviews are half answers from the old review screen; finish them in the app to grade him.")
    elif g["n"]:
        print(f"  measured like the evals: {g['passed']} of {g['n']} right, "
              f"too cautious {g['errors']['too_cautious']}, too permissive {g['errors']['too_permissive']}, "
              f"wrong action {g['errors']['wrong_action']}, acted when you'd have stopped it {g['acted_when_you_would_stop']}")
    print()
    for decision in sorted(history.decisions.values(), key=lambda d: d.created_at):
        review = history.review_for(decision.id)
        if review is None or review.label in (ReviewLabel.CORRECT, ReviewLabel.SKIP):
            continue
        found = answer_for(history, decision)
        print(f"── {REVIEW_LABEL_NAMES[review.label]}  (decision {decision.id})")
        print(f"   From:    {decision.sender}")
        print(f"   Subject: {decision.subject}")
        print(f"   Oscar:   {decision.action.value} → {decision.autonomy_level.value}")
        if found:
            right = found[1]
            # Ready to paste into a regression case's "expect".
            expect = {"level": right.level.value, **({"action": right.action.value} if isinstance(right.action, Action) else {})}
            extra = ("  (none of Oscar's actions: see the note)" if right.action == OTHER_ACTION else
                     "  (bringing it to you is fine too)" if right.escalate_ok else "")
            print(f"   Expect:  {json.dumps(expect)}{extra}")
            details = [x for x in (review.why and f"why: {review.why}", review.actual_type and f"really: {review.actual_type}",
                                   review.reasons and "reasons: " + ", ".join(r.value for r in review.reasons),
                                   review.label_name and f"label: {review.label_name}") if x]
            if details:
                print(f"   {' · '.join(details)}")
        else:
            should = [x for x in (review.should_be_level and review.should_be_level.value,
                                  review.should_be_action and review.should_be_action.value, review.actual_type) if x]
            print(f"   Should:  {' / '.join(should) or '?'}  (half an answer, from the old review screen)")
        if review.note:
            print(f"   Note:    {review.note}")
        print()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m oscar")
    commands = parser.add_subparsers(dest="command")

    decide_cmd = commands.add_parser("decide", help="decide on emails")
    decide_cmd.add_argument("files", nargs="*")

    feedback_cmd = commands.add_parser("feedback", help="give feedback on a decision")
    feedback_cmd.add_argument("decision_id")
    feedback_cmd.add_argument("kind", choices=[k.value for k in FeedbackKind], type=str.upper)
    feedback_cmd.add_argument("--text", help="edited reply, for EDIT_THEN_SEND")

    commands.add_parser("learned", help="show what Oscar has learned")
    commands.add_parser("reviews", help="real inbox: review summary and disagreements")

    args = parser.parse_args(argv)
    history = History(default_data_dir())

    if args.command == "reviews":
        run_reviews(History(real_inbox_dir()))
        return 0
    if args.command == "learned":
        run_learned(history)
        return 0
    if args.command == "feedback":
        return run_feedback(history, args.decision_id, args.kind, args.text)
    run_decide(history, getattr(args, "files", []))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
