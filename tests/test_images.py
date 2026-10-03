import httpx
import pytest

from oscar import images
from oscar.api import app, get_http
from fastapi.testclient import TestClient

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100


def server(routes: dict[str, httpx.Response]) -> httpx.Client:
    """A pretend internet: each URL gives back its response, anything else a 404."""
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return routes.get(str(request.url), httpx.Response(404))
    client = httpx.Client(transport=httpx.MockTransport(handler))
    client.seen = seen
    return client


@pytest.fixture(autouse=True)
def public_names(monkeypatch):
    # No real DNS in tests: names ending in .example are public, anything else isn't found.
    def lookup(host: str) -> list[str]:
        return ["93.184.216.34"] if host.endswith(".example") else []
    monkeypatch.setattr(images, "lookup", lookup)


def test_fetches_an_image():
    http = server({"https://shop.example/hero.png": httpx.Response(200, content=PNG, headers={"content-type": "image/png"})})
    assert images.fetch("https://shop.example/hero.png", http) == (PNG, "image/png")


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/x.png",
    "http://localhost:8000/gmail",
    "http://10.0.0.1/router.png",
    "http://192.168.1.1/x.png",
    "http://169.254.169.254/latest/meta-data",  # a cloud server's own secrets
    "http://[::1]/x.png",
    "http://[::ffff:127.0.0.1]/x.png",  # this computer, written as an IPv6 address
    "http://0.0.0.0:8000/x.png",
    "http://unknown-name/x.png",
    "file:///etc/passwd",
    "ftp://shop.example/x.png",
    "javascript:alert(1)",
])
def test_only_public_web_addresses(url):
    http = server({})
    with pytest.raises(images.ImageError):
        images.fetch(url, http)
    assert http.seen == []  # refused before anything was sent


def test_a_redirect_is_checked_too():
    http = server({"https://shop.example/x.png": httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})})
    with pytest.raises(images.ImageError):
        images.fetch("https://shop.example/x.png", http)
    assert http.seen == ["https://shop.example/x.png"]


def test_follows_a_redirect_to_a_public_image():
    http = server({
        "https://shop.example/x.png": httpx.Response(301, headers={"location": "https://cdn.example/x.png"}),
        "https://cdn.example/x.png": httpx.Response(200, content=PNG, headers={"content-type": "image/png"}),
    })
    assert images.fetch("https://shop.example/x.png", http)[1] == "image/png"


@pytest.mark.parametrize("content_type", ["text/html", "image/svg+xml", "application/javascript", ""])
def test_only_images(content_type):
    http = server({"https://shop.example/x": httpx.Response(200, content=b"<script>", headers={"content-type": content_type})})
    with pytest.raises(images.ImageError):
        images.fetch("https://shop.example/x", http)


def test_not_too_big():
    big = httpx.Response(200, content=b"0" * (images.MAX_BYTES + 1), headers={"content-type": "image/jpeg"})
    with pytest.raises(images.ImageError):
        images.fetch("https://shop.example/huge.jpg", server({"https://shop.example/huge.jpg": big}))


def test_sends_nothing_about_you():
    http = server({"https://shop.example/x.png": httpx.Response(200, content=PNG, headers={"content-type": "image/png"})})
    sent = []
    http.event_hooks["request"] = [sent.append]
    images.fetch("https://shop.example/x.png", http)
    headers = {k.lower() for k in sent[0].headers}
    assert "cookie" not in headers and "referer" not in headers
    assert "Oscar" in sent[0].headers["user-agent"]


def test_endpoint():
    http = server({"https://shop.example/x.png": httpx.Response(200, content=PNG, headers={"content-type": "image/png"})})
    app.dependency_overrides[get_http] = lambda: http
    try:
        client = TestClient(app)
        r = client.get("/email-image", params={"url": "https://shop.example/x.png"})
        assert r.status_code == 200 and r.content == PNG and r.headers["content-type"] == "image/png"
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["content-security-policy"] == "default-src 'none'"
        assert client.get("/email-image", params={"url": "http://127.0.0.1/x.png"}).status_code == 404
    finally:
        app.dependency_overrides.clear()
