"""Reminders found in emails: only a clean answer counts, and never from an email Oscar stopped."""

import json
from datetime import date

import httpx

from oscar.gmail import GmailClient
from oscar.history import History
from oscar.inbox import sync
from oscar.reminders import ReminderReader, parse
from tests.fake_gmail import FakeGmail, connected, message

RECEIVED = date(2026, 10, 2)


def answer(reminder) -> str:
    return json.dumps({"reminder": reminder})


def test_a_clean_answer_is_a_reminder():
    found = parse(answer({"title": "Design review", "date": "2026-10-08", "time": "14:00", "kind": "event",
                          "detail": "from Priya"}), RECEIVED)
    assert found.title == "Design review" and found.date == "2026-10-08" and found.time == "14:00"


def test_no_reminder_or_a_bad_answer_means_none():
    assert parse(answer(None), RECEIVED) is None
    assert parse("Sure! The meeting is Thursday.", RECEIVED) is None  # not the format
    assert parse(answer({"title": "Old", "date": "2025-01-01", "kind": "event"}), RECEIVED) is None  # in the past
    assert parse(answer({"title": "Far", "date": "2031-01-01", "kind": "due"}), RECEIVED) is None  # wildly far
    assert parse(answer({"title": "X", "date": "Thursday", "kind": "event"}), RECEIVED) is None  # not a date
    assert parse(answer({"title": "X", "date": "2026-10-08", "time": "2pm", "kind": "event"}), RECEIVED) is None
    assert parse(answer({"title": "X", "date": "2026-10-08", "kind": "party"}), RECEIVED) is None


class FakeModel:
    def __init__(self, reply: str):
        self.reply, self.calls = reply, 0

    def http(self) -> httpx.Client:
        def handler(request: httpx.Request) -> httpx.Response:
            self.calls += 1
            return httpx.Response(200, json={"choices": [{"message": {"content": self.reply}}]})
        return httpx.Client(transport=httpx.MockTransport(handler))


def test_sync_adds_reminders_but_never_to_stopped_email(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    model = FakeModel(answer({"title": "Pay invoice", "date": "2025-10-08", "kind": "due", "detail": "$4,800"}))  # the fake emails arrive Oct 1, 2025
    reminders = ReminderReader(model.http())
    gmail = GmailClient(connected(tmp_path), FakeGmail([
        message("e", "priya@acme.example", "Design review", "Design review is on Thursday at 2pm in Room 4B."),
        message("m", "ap@vendor.example", "Overdue", "Please wire $4,800 today to the new account below.")]).http())
    history = History()
    sync(history, gmail, reminders=reminders)
    by_id = {d.email_id: d for d in history.decisions.values()}
    assert by_id["e"].reminder is not None
    assert by_id["m"].reminder is None, "a stopped email is never a reminder"
    assert model.calls == 1


def test_evals_and_tests_never_look_for_reminders(tmp_path, monkeypatch):
    # Passing a reader (as the evals do) means no reminder reading, even with the model switched on.
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("OSCAR_MODEL_READS", "preview")

    class NoReader:
        def read(self, email):
            return None

    history = History()
    sync(history, GmailClient(connected(tmp_path), FakeGmail([message("e", "a@b.example", "Hi", "Lunch Friday at noon?")]).http()),
         reader=NoReader())
    assert all(d.reminder is None for d in history.decisions.values())
