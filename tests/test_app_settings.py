"""Settings: how Oscar shows up in Gmail, clearing what he learned (and bringing it back), and export."""

import json

import pytest

from oscar import app_settings
from oscar.feedback import FeedbackKind, record_feedback
from oscar.history import History
from oscar.models import AutonomyLevel
from oscar.preferences import Preferences
from oscar.review import teaching
from tests.learning.test_action_vs_autonomy import decide_in, promo, promotions_quietly


def test_defaults_and_changes(tmp_path):
    path = tmp_path / "app_settings.json"
    s = app_settings.load(path)
    assert s.companion.show and s.companion.position == "right" and s.companion.animate
    assert s.notify.approvals and s.notify.safety and not s.notify.handled
    saved = app_settings.update(path, {"notify": {"handled": True}, "companion": {"position": "left"}})
    assert saved.notify.handled and saved.companion.position == "left" and saved.notify.safety
    assert app_settings.load(path) == saved


@pytest.mark.parametrize("changes", [{"colour": {"x": 1}}, {"companion": {"position": "top"}}, {"notify": {"sms": True}}])
def test_unknown_settings_are_refused(tmp_path, changes):
    with pytest.raises(app_settings.AppSettingsError):
        app_settings.update(tmp_path / "s.json", changes)


def test_a_broken_file_falls_back_to_the_defaults(tmp_path):
    path = tmp_path / "s.json"
    path.write_text("{not json")
    assert app_settings.load(path) == app_settings.AppSettings()


def test_api_settings_reach_the_extension(client):
    assert client.get("/app-settings").json()["notify"]["handled"] is False
    r = client.post("/app-settings", json={"companion": {"show": False}})
    assert r.status_code == 200 and r.json()["companion"]["show"] is False
    assert client.get("/extension/status").json()["settings"]["companion"]["show"] is False
    assert client.post("/app-settings", json={"companion": {"show": "maybe"}}).status_code == 400


def test_clearing_what_he_learned_keeps_everything_and_can_be_undone():
    history = History()
    promotions_quietly(history)
    assert decide_in(history, promo(5, sender="hi@new-shop.example")).autonomy_level == AutonomyLevel.PROCEED_SILENTLY
    before = len(history.feedback)

    history.set_setting("learning_since", "2999-01-01T00:00:00+00:00")
    assert teaching(history) == [] and len(history.feedback) == before, "nothing is deleted"
    assert decide_in(history, promo(6, sender="hi@other-shop.example")).autonomy_level == AutonomyLevel.ASK_FIRST

    history.set_setting("learning_since", None)
    assert decide_in(history, promo(7, sender="hi@third-shop.example")).autonomy_level == AutonomyLevel.PROCEED_SILENTLY


def test_answers_after_clearing_still_teach():
    history = History()
    first = decide_in(history, promo(1))
    record_feedback(history, first.id, FeedbackKind.KEEP_ASKING)
    history.set_setting("learning_since", "2000-01-01T00:00:00+00:00")  # before everything: nothing dropped
    assert len(teaching(history)) == 1
    assert Preferences.from_feedback(teaching(history)).records


def test_api_clear_restore_and_export(client):
    client.post("/demo/inbox")
    cleared = client.post("/learning/clear").json()
    assert cleared["cleared_at"] and client.get("/learning").json()["cleared_at"] == cleared["cleared_at"]
    assert client.post("/learning/restore").json()["cleared_at"] is None
    r = client.get("/export")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    body = json.loads(r.text)
    assert body["inbox"] == "demo" and body["decisions"] and "decision" in body["decisions"][0]
