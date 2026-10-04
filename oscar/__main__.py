"""Command line for Oscar.

    python -m oscar                                 decide on every email in emails/
    python -m oscar decide emails/newsletter.json   decide on one email
    python -m oscar feedback <decision_id> APPROVE  give feedback on a decision
    python -m oscar feedback <decision_id> EDIT_THEN_SEND --text "Sure, Thursday works."
    python -m oscar learned                         show what Oscar has learned
    python -m oscar reviews                         real inbox: how Oscar did, and where you disagreed
    python -m oscar regression <decision_id>        real inbox: draft a scrubbed regression case from a review
    python -m oscar replay [--limit N] [--rules-only]  real inbox: today's Oscar on the emails you answered
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.history import History, default_data_dir, real_inbox_dir
from oscar.models import Action, Email
from oscar.preferences import Preferences
from oscar.review import teaching
from oscar.review import OTHER_ACTION, REVIEW_LABEL_NAMES, ReviewLabel, answer_for, summary
from oscar.voice import describe_learning

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "emails"


def run_decide(history: History, files: list[str]) -> None:
    paths = [Path(p) for p in files] or sorted(DEFAULT_DIR.glob("*.json"))
    for path in paths:
        email = Email.model_validate_json(path.read_text())
        decision = decide(email, Preferences.from_feedback(teaching(history)))
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
    rows = Preferences.from_feedback(teaching(history)).summary()
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


def run_replay(limit: int | None, rules_only: bool) -> int:
    """Today's Oscar on the real emails you've answered, graded against your answers. Gmail is only
    read, with a read-only client, the way the app connects to it."""
    import httpx

    from oscar import app_settings
    from oscar.gmail import GmailClient, GmailError, TokenStore
    from oscar.inbox import reader_for
    from oscar.replay import replay, targets
    from oscar.understand import api_key, reads_real_email

    tokens = TokenStore(default_data_dir() / "gmail" / "token.json")
    if not tokens.load():
        print("Gmail isn't connected. Connect it in the app first, then run this again.")
        return 1
    history = History(real_inbox_dir())
    if not targets(history):
        print("No answered real emails yet. Answer some in Review first, then run this again.")
        return 0
    reader = None
    if rules_only:
        print("Using the rules only, as asked.")
    elif reads_real_email() == "off":
        print("The model is off for real emails (OSCAR_MODEL_READS), so this uses the rules only.")
    elif not api_key():
        print("There's no model key, so this uses the rules only.")
    else:
        reader = reader_for(history)
    names = app_settings.load(default_data_dir() / "app_settings.json").labels
    gmail = GmailClient(tokens, httpx.Client(timeout=20), names=names, read_only=True)
    try:
        result = replay(history, gmail, reader, limit=limit)
    except GmailError as e:
        print(f"Gmail stopped the replay partway ({e}). Try again in a few minutes.")
        return 1
    except httpx.HTTPError as e:
        print(f"Lost the connection to Gmail partway ({type(e).__name__}). Try again.")
        return 1
    print_replay(history, result)
    return 0


def print_replay(history: History, result: dict) -> None:
    def about(row: dict) -> str:
        d = history.get_decision(row["decision_id"])
        return f'"{d.subject}" from {d.sender}' if d else row["email_id"]

    def call(c: dict) -> str:
        grade = c.get("grade")
        return f"{c['action']} → {c['level']}" + (f" ({'right' if grade == 'none' else grade.replace('_', ' ')})" if grade else "")

    print()
    model = "rules only" if result["model"] == "off" else f"model reads {result['model']}"
    print(f"Version {result['version']}, {model}. {result['read']} of {result['emails']} emails read again.")
    if result["not_read"]:
        # What Gmail said, so a deleted email isn't mixed up with one Gmail wouldn't show.
        said = Counter(g.get("status") for g in result["not_read"])
        print(f"{result['skipped']} skipped: " + ", ".join(
            f"{n} {'deleted (404)' if status == 404 else f'Gmail said {status}'}" for status, n in said.most_common()) + ".")
    risks, wrong = result["real_risks"], result["wrong_stops"]
    by_id = {r["email_id"]: r for r in [*result["per_email"], *result["not_read"]]}
    if risks["not_stopped"]:
        print()
        print(f"REAL RISKS NO LONGER STOPPED: {len(risks['not_stopped'])}. Look at these first.")
        for email_id in risks["not_stopped"]:
            print(f"  {about(by_id[email_id])}")
            print(f"     now: {call(by_id[email_id]['now'])}")
    if risks["not_read"]:
        print()
        print(f"Real risks that couldn't be checked: {len(risks['not_read'])}. Gmail didn't give them back.")
        for email_id in risks["not_read"]:
            print(f"  {about(by_id[email_id])}")
    before, now_ = result["before"], result["now"]
    if now_["n"]:
        print()
        print(f"On the same {now_['n']} emails you answered in Review:")
        if now_.get("level_not_graded"):
            print(f"  ({now_['level_not_graded']} are a Yes to something he asked: a Yes says the action was right,"
                  " not how much to ask, so only the action is graded.)")
        print(f"  {'':34}{'before':>8}{'now':>8}")
        rows = [("right", "passed"), ("too cautious", "too_cautious"), ("too permissive", "too_permissive"),
                ("wrong action", "wrong_action"), ("acted when you'd have stopped it", "acted_when_you_would_stop")]
        for name, key in rows:
            pick = lambda g: g[key] if key in g else g["errors"][key]  # noqa: E731
            print(f"  {name:34}{pick(before):>8}{pick(now_):>8}")
    print()
    if wrong["of"] or wrong["not_read"]:
        print(f"Wrong stops: {wrong['still_stopped']} of {wrong['of']} you marked misclassified are still stopped.")
    if wrong["not_read"]:
        print(f"  {len(wrong['not_read'])} more couldn't be read from Gmail, so they weren't checked.")
    if risks["of"] or risks["not_read"]:
        print(f"Real risks: {risks['still_stopped']} of {risks['of']} you marked as real risks are still stopped.")
    if risks["not_read"]:
        print(f"  {len(risks['not_read'])} more couldn't be read from Gmail, so they weren't checked.")
    for moved, title in (("better", "Better now"), ("worse", "Worse now"), ("changed", "Different mistake now")):
        changed = [r for r in result["per_email"] if r["moved"] == moved]
        if changed:
            print()
            print(f"{title} ({len(changed)}):")
            for r in changed:
                print(f"  {about(r)}")
                print(f"     before: {call(r['before'])}   now: {call(r['now'])}")
    print()
    if result.get("saved_to"):
        print(f"Saved to {result['saved_to']}")
    else:
        print("Nothing could be read again, so nothing was saved.")


def at_least_one(text: str) -> int:
    n = int(text)
    if n < 1:
        raise argparse.ArgumentTypeError("needs to be 1 or more")
    return n


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
    replay_cmd = commands.add_parser("replay", help="real inbox: decide again on the emails you answered, and compare")
    replay_cmd.add_argument("--limit", type=at_least_one, help="only the newest N answered emails")
    replay_cmd.add_argument("--rules-only", action="store_true", help="leave the model out")
    regression_cmd = commands.add_parser("regression", help="real inbox: draft a regression case from a review")
    regression_cmd.add_argument("decision_id")

    args = parser.parse_args(argv)
    history = History(default_data_dir())

    if args.command == "reviews":
        run_reviews(History(real_inbox_dir()))
        return 0
    if args.command == "replay":
        return run_replay(args.limit, args.rules_only)
    if args.command == "regression":
        from oscar.regression import write_draft
        try:
            path = write_draft(History(real_inbox_dir()), args.decision_id)
        except KeyError as e:
            print(e.args[0])
            return 1
        print(f"Draft written to {path} (git ignores it). Rewrite the email as a synthetic one, fill in the TODOs,")
        print("then move it into evals/regression_cases/ and run python -m evals.regressions.")
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
