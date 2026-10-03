import pytest
from fastapi.testclient import TestClient

from oscar.api import app, get_history, get_tokens
from oscar.gmail import TokenStore
from oscar.history import History


@pytest.fixture(autouse=True)
def no_real_data(monkeypatch, tmp_path_factory):
    """Tests never read or write your real data folder: anything that looks it up gets a scratch one."""
    monkeypatch.setenv("OSCAR_DATA_DIR", str(tmp_path_factory.mktemp("data")))


@pytest.fixture(autouse=True)
def no_real_keys(monkeypatch):
    """Tests never use the keys in .env: no real Gemini or Google calls from a test run."""
    for name in ("GEMINI_API_KEY", "OSCAR_CHAT_API_KEY", "OSCAR_CHAT_BASE_URL", "OSCAR_CHAT_MODEL",
                 "OSCAR_MODEL_API_KEY", "OSCAR_MODEL_BASE_URL", "OSCAR_MODEL", "OSCAR_MODEL_READS",
                 "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
        monkeypatch.delenv(name, raising=False)
    # Never check a real Gmail on a timer during tests.
    monkeypatch.setenv("OSCAR_AUTO_CHECK_MINUTES", "0")


@pytest.fixture
def client(tmp_path):
    history = History()
    app.dependency_overrides[get_history] = lambda: history
    # Never the real token file: tests run as if Gmail isn't connected.
    app.dependency_overrides[get_tokens] = lambda: TokenStore(tmp_path / "token.json")
    yield TestClient(app, headers={"content-type": "application/json"})
    app.dependency_overrides.clear()
