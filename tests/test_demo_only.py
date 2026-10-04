"""OSCAR_DEMO_ONLY: the copy of Oscar hosted for anyone to try. With no sign-in, nothing but the
demo may answer: every call needs a browser's own demo session, except the status the front page
asks for first. Off, nothing changes."""

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from oscar import demo
from oscar.api import app, get_real_history, get_tokens
from oscar.gmail import TokenStore
from oscar.history import History

JSON = {"content-type": "application/json"}


@pytest.fixture
def hosted(tmp_path, monkeypatch):
    """Demo-only, with a real inbox and token in a scratch folder that nothing may read."""
    monkeypatch.setenv("OSCAR_DEMO_ONLY", "1")
    monkeypatch.setattr(demo, "SESSIONS", demo.Sessions())
    touched = []

    class Watched(TokenStore):
        def load(self):
            touched.append("token read")
            return super().load()

    app.dependency_overrides[get_tokens] = lambda: Watched(tmp_path / "token.json")
    app.dependency_overrides[get_real_history] = lambda: touched.append("real inbox") or History(tmp_path / "real")
    yield touched
    app.dependency_overrides.clear()


def every_route():
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods - {"HEAD"}:
                yield method, route.path.replace("{", "").replace("}", "")


def test_every_route_refuses_a_visitor_without_a_demo(hosted):
    client = TestClient(app, headers=JSON)
    for method, path in every_route():
        status = client.request(method, path, json={}).status_code
        if (method, path) == ("GET", "/gmail"):
            assert status == 200
        else:
            assert status == 403, (method, path, status)
    assert hosted == []  # the real inbox and Gmail token were never even looked at


def test_the_front_page_learns_it_is_demo_only(hosted):
    status = TestClient(app, headers=JSON).get("/gmail").json()
    assert status["only_demo"] and not status["configured"] and not status["connected"]
    assert hosted == []


def test_the_demo_works_and_real_routes_stay_shut(hosted):
    client = TestClient(app, headers={**JSON, "X-Oscar-Demo": "browser-one"})
    started = client.post("/demo/start").json()
    assert started and client.get("/gmail").json()["only_demo"]
    asked = next(d for d in started if d["autonomy_level"] == "ASK_FIRST")
    assert client.post("/feedback", json={"decision_id": asked["id"], "kind": "APPROVE"}).status_code == 200
    assert client.post("/demo/check").status_code == 200
    for method, path in [("POST", "/decide"), ("POST", "/gmail/sync"), ("GET", "/auth/google/start")]:
        assert client.request(method, path, json={}).status_code in (409, 422), path
    assert hosted == []


def test_a_bad_session_id_is_refused(hosted):
    for session in ["", "x", "../../etc", "a" * 200]:
        assert TestClient(app, headers={**JSON, "X-Oscar-Demo": session}).get("/decisions").status_code in (400, 403)


def test_off_by_default(monkeypatch):
    monkeypatch.delenv("OSCAR_DEMO_ONLY", raising=False)
    assert TestClient(app, headers=JSON).get("/gmail").json()["only_demo"] is False
