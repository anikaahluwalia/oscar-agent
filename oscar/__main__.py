"""Command line for Oscar.

    python -m oscar                                 decide on every email in emails/
    python -m oscar decide emails/newsletter.json   decide on one email
    python -m oscar feedback <decision_id> APPROVE  give feedback on a decision
    python -m oscar feedback <decision_id> EDIT_THEN_SEND --text "Sure, Thursday works."
"""

import argparse
import sys
from pathlib import Path

from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.history import History, default_data_dir
from oscar.models import Email
from oscar.preferences import Preferences

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


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m oscar")
    commands = parser.add_subparsers(dest="command")

    decide_cmd = commands.add_parser("decide", help="decide on emails")
    decide_cmd.add_argument("files", nargs="*")

    feedback_cmd = commands.add_parser("feedback", help="give feedback on a decision")
    feedback_cmd.add_argument("decision_id")
    feedback_cmd.add_argument("kind", choices=[k.value for k in FeedbackKind], type=str.upper)
    feedback_cmd.add_argument("--text", help="edited reply, for EDIT_THEN_SEND")

    args = parser.parse_args(argv)
    history = History(default_data_dir())

    if args.command == "feedback":
        return run_feedback(history, args.decision_id, args.kind, args.text)
    run_decide(history, getattr(args, "files", []))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
