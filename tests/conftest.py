import pytest
from fastapi.testclient import TestClient

from oscar.api import app, get_history, get_tokens
from oscar.gmail import TokenStore
from oscar.history import History


@pytest.fixture
def client(tmp_path):
    history = History()
    app.dependency_overrides[get_history] = lambda: history
    # Never the real token file: tests run as if Gmail isn't connected.
    app.dependency_overrides[get_tokens] = lambda: TokenStore(tmp_path / "token.json")
    yield TestClient(app, headers={"content-type": "application/json"})
    app.dependency_overrides.clear()
