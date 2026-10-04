"""Replaying today's Oscar on the real emails you answered (oscar/replay.py).

Each email is read again from Gmail, decided on by the current Oscar without anything you said
about it, and graded against your answer next to his first call, on the same emails. It only reads:
nothing in Gmail changes and nothing is added to the history."""

import json

import httpx
import pytest

from oscar import replay as replay_module
from oscar.__main__ import main, print_replay
from oscar.agent import decide
from oscar.classification import record_classification, type_hints
from oscar.feedback import FeedbackKind, record_feedback
from oscar.gmail import GmailClient, GmailError, parse_message
from oscar.history import History
from oscar.models import Action, AutonomyLevel
from oscar.preferences import Preferences
from oscar.replay import replay
from oscar.review import Review, ReviewLabel, answer, record_review, teaching
from oscar.safety_review import record_safety_review
from tests.fake_gmail import FakeGmail, connected, message

S, A, E = AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.ASK_FIRST, AutonomyLevel.ESCALATE
PROMO = "New arrivals are here, 20% off this weekend. View in browser. Manage your preferences."
WIRE = "Please wire me $4,800 today to the account below."


def promo(n):
    return message(f"p{n}", f"deals@shop{n}.example", "Sale this weekend", PROMO)


def first_read(history, raw, **old):
    """Oscar's first call on an email, logged like the real inbox does. old: what an older Oscar
    decided differently."""
    email, info = parse_message(raw)
    d = decide(email, read_only=True).model_copy(update={"source": "gmail", "gmail": info, "policy_version": "old", **old})
    history.add_decision(d)
    return d


def wrong_stop(history, raw):
    """An older Oscar stopped this email with a safety rule."""
    return first_read(history, raw, autonomy_level=E, level_source="safety_check")


def setup(tmp_path, messages, fake=None):
    fake = fake or FakeGmail(messages)
    return History(tmp_path / "account"), fake, GmailClient(connected(tmp_path), fake.http())


def quiet(*args):
    pass


def test_grades_today_against_your_answers_on_the_same_emails(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1), promo(2)])
    old = wrong_stop(history, promo(1))
    record_review(history, answer(old, A, Action.ARCHIVE, why="preference"))
    fine = first_read(history, promo(2))
    record_review(history, Review(decision_id=fine.id, label=ReviewLabel.CORRECT))

    result = replay(history, gmail, say=quiet)
    assert result["read"] == 2 and result["skipped"] == 0
    assert result["before"]["n"] == result["now"]["n"] == 2
    assert result["before"]["passed"] == 1 and result["before"]["errors"]["too_cautious"] == 1
    assert result["now"]["passed"] == 2
    moved = {r["email_id"]: r["moved"] for r in result["per_email"]}
    assert moved == {"p1": "better", "p2": None}


def test_an_email_never_learns_from_what_you_said_about_it(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1)])
    d = first_read(history, promo(1), acting=True)
    assert d.autonomy_level == A
    record_feedback(history, d.id, FeedbackKind.ALWAYS_DO_THIS)
    record_review(history, answer(d, S, Action.ARCHIVE, why="preference"))
    email, _ = parse_message(promo(1))
    assert decide(email, Preferences.from_feedback(teaching(history))).autonomy_level != A, "what would leak"

    assert teaching(history, skip_email="p1") == [], "neither the button nor the review on it"
    result = replay(history, gmail, say=quiet)
    assert result["per_email"][0]["now"]["level"] == A.value


def test_an_email_never_learns_what_kind_you_said_it_was(tmp_path, monkeypatch):
    history, fake, gmail = setup(tmp_path, [promo(1)])
    d = first_read(history, promo(1))
    record_classification(history, d.id, "receipt")
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT))
    assert type_hints(history) == {"deals@shop1.example": "receipt"}, "what would leak"
    hints = []
    monkeypatch.setattr(replay_module, "decide", lambda *a, **kw: hints.append(kw["type_hint"]) or decide(*a, **kw))
    replay(history, gmail, say=quiet)
    assert hints == [None]


def test_skip_email_only_drops_feedback_on_that_email(tmp_path):
    history, fake, gmail = setup(tmp_path, [])
    one, two = first_read(history, promo(1), acting=True), first_read(history, promo(2), acting=True)
    record_feedback(history, one.id, FeedbackKind.APPROVE)
    record_feedback(history, two.id, FeedbackKind.APPROVE)
    assert [e.decision_id for e in teaching(history, skip_email="p1")] == [two.id]


def test_nothing_is_written_to_gmail_or_the_history(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1)])
    d = wrong_stop(history, promo(1))
    record_review(history, answer(d, A, Action.ARCHIVE, why="preference"))
    record_safety_review(history, d.id, "MISCLASSIFIED")
    files = {p.name: p.read_text() for p in history.data_dir.iterdir()}
    counts = (len(history.decisions), len(history.feedback), len(history.reviews), len(history.safety_reviews))

    replay(history, gmail, say=quiet)
    assert [r.method for r in fake.gmail_requests()] == ["GET"], "one read, and no writes"
    assert (len(history.decisions), len(history.feedback), len(history.reviews), len(history.safety_reviews)) == counts
    assert {p.name: p.read_text() for p in history.data_dir.iterdir() if p.is_file()} == files
    assert gmail.read_only is False, "the client it was given is left as it was; the replay uses its own read-only copy"


def test_an_email_gmail_no_longer_has_is_skipped(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1), promo(2)])
    for n in (1, 2):
        d = first_read(history, promo(n))
        record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT))
    del fake.messages["p1"]
    result = replay(history, gmail, say=quiet)
    assert (result["emails"], result["read"], result["skipped"]) == (2, 1, 1)
    assert result["before"]["n"] == result["now"]["n"] == 1, "before and now on the same emails"


class Troubled(FakeGmail):
    """A Gmail that answers some reads with an error instead of the email."""

    def __init__(self, messages, errors):
        super().__init__(messages)
        self.errors = errors  # message id -> the statuses to answer with, in turn

    def handler(self, request):
        message_id = request.url.path.rsplit("/", 1)[-1]
        if self.errors.get(message_id):
            self.requests.append(request)
            return httpx.Response(self.errors[message_id].pop(0), json={})
        return super().handler(request)


def test_gmail_saying_slow_down_waits_and_reads_again(tmp_path):
    history, fake, gmail = setup(tmp_path, [], Troubled([promo(1)], {"p1": [429, 429]}))
    d = first_read(history, promo(1))
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT))
    result = replay(history, gmail, say=quiet)
    assert (result["read"], result["skipped"]) == (1, 0)
    assert len(fake.gmail_requests()) == 3


def test_an_outage_stops_the_replay_instead_of_skipping(tmp_path):
    history, fake, gmail = setup(tmp_path, [], Troubled([promo(1), promo(2)], {"p1": [503], "p2": [503]}))
    for n in (1, 2):
        d = first_read(history, promo(n))
        record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT))
    with pytest.raises(GmailError):
        replay(history, gmail, say=quiet)
    assert not (history.data_dir / "replays").exists(), "nothing saved"


def test_a_run_that_reads_nothing_saves_nothing(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1)])
    d = first_read(history, promo(1))
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT))
    first = replay(history, gmail, say=quiet)
    del fake.messages["p1"]
    again = replay(history, gmail, say=quiet)
    assert again["read"] == 0 and "saved_to" not in again
    assert json.loads(open(first["saved_to"]).read())["read"] == 1, "the earlier run is kept"


def test_limit_keeps_the_newest_and_saves_apart(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1), promo(2), promo(3)])
    for n in (1, 2, 3):
        d = first_read(history, promo(n))
        record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT))
    result = replay(history, gmail, limit=2, say=quiet)
    assert [r["email_id"] for r in result["per_email"]] == ["p2", "p3"]
    assert result["saved_to"].endswith("-rules-only-newest-2.json"), "never replaces a full run"
    assert replay(history, gmail, limit=5, say=quiet)["saved_to"].endswith("-rules-only.json")


def test_safety_reviews_say_what_is_still_stopped(tmp_path):
    wire = message("w1", "accounts@vendor.example", "Overdue", WIRE)
    wire2 = message("w2", "billing@vendor.example", "Overdue", WIRE)
    history, fake, gmail = setup(tmp_path, [promo(1), promo(2), wire, wire2])
    record_safety_review(history, wrong_stop(history, promo(1)).id, "MISCLASSIFIED")
    # You said this was a wrong stop, but today's Oscar still stops it.
    record_safety_review(history, first_read(history, wire2).id, "MISCLASSIFIED")
    risk = first_read(history, wire)
    assert risk.autonomy_level == E
    record_safety_review(history, risk.id, "RISK_CORRECT")
    # You said this one was a real risk, and today's Oscar doesn't stop it.
    record_safety_review(history, wrong_stop(history, promo(2)).id, "RISK_CORRECT")

    result = replay(history, gmail, say=quiet)
    assert result["wrong_stops"] == {"of": 2, "still_stopped": 1, "not_read": []}, "one fixed, one not"
    assert result["real_risks"] == {"of": 2, "still_stopped": 1, "not_stopped": ["p2"], "not_read": []}
    assert result["now"]["n"] == 0, "no full answers, so nothing to grade"


def test_safety_reviewed_emails_gmail_no_longer_has_are_named(tmp_path, capsys):
    wires = [message(f"w{n}", f"accounts{n}@vendor.example", "Overdue", WIRE) for n in (1, 2, 3)]
    history, fake, gmail = setup(tmp_path, [*wires, promo(1)])
    for raw in wires:
        record_safety_review(history, first_read(history, raw).id, "RISK_CORRECT")
    record_safety_review(history, wrong_stop(history, promo(1)).id, "MISCLASSIFIED")
    for gone in ("w1", "w2", "p1"):
        del fake.messages[gone]

    result = replay(history, gmail, say=quiet)
    assert result["real_risks"] == {"of": 1, "still_stopped": 1, "not_stopped": [], "not_read": ["w1", "w2"]}
    assert result["wrong_stops"]["not_read"] == ["p1"]
    assert json.loads(open(result["saved_to"]).read())["real_risks"]["not_read"] == ["w1", "w2"]
    assert {g["status"] for g in result["not_read"]} == {404}, "what Gmail said is kept, to tell deleted from hidden"
    print_replay(history, result)
    out = capsys.readouterr().out
    assert "Real risks that couldn't be checked: 2" in out
    assert "accounts1@vendor.example" in out and "accounts2@vendor.example" in out
    assert "2 more couldn't be read from Gmail" in out


def test_real_risks_no_longer_stopped_are_listed_first(tmp_path, capsys):
    history, fake, gmail = setup(tmp_path, [promo(1)])
    record_safety_review(history, wrong_stop(history, promo(1)).id, "RISK_CORRECT")
    print_replay(history, replay(history, gmail, say=quiet))
    out = capsys.readouterr().out
    assert "REAL RISKS NO LONGER STOPPED: 1" in out and "deals@shop1.example" in out
    assert out.index("REAL RISKS NO LONGER STOPPED") < out.index("Real risks: 0 of 1")


def test_the_result_is_saved_in_the_account_folder(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1)])
    d = first_read(history, promo(1))
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT))
    said = []
    result = replay(history, gmail, say=said.append)
    path = tmp_path / "account" / "replays" / f"{result['version']}-rules-only.json"
    assert result["saved_to"] == str(path)
    saved = json.loads(path.read_text())
    assert saved["now"]["passed"] == 1 and saved["per_email"][0]["email_id"] == "p1"
    assert PROMO not in path.read_text() and "Sale this weekend" not in path.read_text(), "no email text"
    assert said == ["Reading 1 emails from Gmail..."]


def test_the_command_needs_gmail_connected(capsys):
    assert main(["replay"]) == 1
    assert "Gmail isn't connected" in capsys.readouterr().out


def test_the_command_wants_a_limit_of_one_or_more():
    for bad in ("0", "-3"):
        with pytest.raises(SystemExit):
            main(["replay", "--limit", bad])


def test_a_mistake_you_later_told_him_to_make_is_marked(tmp_path, capsys):
    # You said "just mark it read" on one email, then "just handle it" (archive) on a later one from
    # the same shop. Archiving the first now goes against its old answer, but it's your newer word.
    first, later = (message(f"p{n}", "deals@shop.example", "Sale this weekend", PROMO) for n in (1, 2))
    history, fake, gmail = setup(tmp_path, [first, later])
    d = first_read(history, first)
    record_review(history, answer(d, S, Action.MARK_READ, why="preference"))
    record_feedback(history, first_read(history, later, acting=True).id, FeedbackKind.JUST_HANDLE_IT)

    result = replay(history, gmail, say=quiet)
    row = next(r for r in result["per_email"] if r["email_id"] == "p1")
    assert row["now"]["action"] == Action.ARCHIVE.value and row["now"]["grade"] == "wrong_action"
    assert row["said_later"] and result["said_later"] == 1
    print_replay(history, result)
    assert "you told him this later" in capsys.readouterr().out


def test_a_mistake_you_never_okayed_isnt_marked(tmp_path):
    history, fake, gmail = setup(tmp_path, [promo(1)])
    d = first_read(history, promo(1))
    record_review(history, answer(d, S, Action.MARK_READ, why="preference"))
    result = replay(history, gmail, say=quiet)
    assert result["said_later"] == 0


def shop(n):
    return message(f"p{n}", "deals@shop.example", "Sale this weekend", PROMO)


def test_an_okay_only_says_the_action_not_how_much_to_ask(tmp_path):
    # "Archive it quietly" on p1, then a plain Approve on p2: he still asks, and the Approve never
    # said he shouldn't, so that mistake isn't put down to you.
    history, fake, gmail = setup(tmp_path, [shop(1), shop(2)])
    record_review(history, answer(first_read(history, shop(1)), S, Action.ARCHIVE, why="preference"))
    record_feedback(history, first_read(history, shop(2), acting=True).id, FeedbackKind.APPROVE)
    row = replay(history, gmail, say=quiet)["per_email"][0]
    assert row["now"]["grade"] == "too_cautious" and not row["said_later"]


def test_a_later_no_takes_the_okay_back(tmp_path):
    history, fake, gmail = setup(tmp_path, [shop(1), shop(2), shop(3)])
    record_review(history, answer(first_read(history, shop(1)), S, Action.MARK_READ, why="preference"))
    record_feedback(history, first_read(history, shop(2), acting=True).id, FeedbackKind.JUST_HANDLE_IT)
    record_feedback(history, first_read(history, shop(3), acting=True).id, FeedbackKind.REJECT)
    row = next(r for r in replay(history, gmail, say=quiet)["per_email"] if r["email_id"] == "p1")
    assert row["now"]["grade"] != "none" and not row.get("said_later")


def test_what_you_said_before_answering_isnt_later(tmp_path):
    history, fake, gmail = setup(tmp_path, [shop(1), shop(2)])
    d = first_read(history, shop(1))
    record_feedback(history, first_read(history, shop(2), acting=True).id, FeedbackKind.JUST_HANDLE_IT)
    record_review(history, answer(d, S, Action.MARK_READ, why="preference"))
    row = next(r for r in replay(history, gmail, say=quiet)["per_email"] if r["email_id"] == "p1")
    assert row["now"]["grade"] == "wrong_action" and not row["said_later"]
