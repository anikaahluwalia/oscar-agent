import pytest
from fastapi.testclient import TestClient

from oscar.api import app, get_history
from oscar.history import History


@pytest.fixture
def client():
    history = History()
    app.dependency_overrides[get_history] = lambda: history
    yield TestClient(app)
    app.dependency_overrides.clear()
