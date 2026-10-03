"""A pretend Gmail for tests, served through httpx.MockTransport. It records every request."""

import base64
import copy
import json
import time

import httpx

from oscar.gmail import GMAIL_URL, SCOPE, TOKEN_URL, USERINFO_URL, TokenStore


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def message(id: str, sender: str, subject: str, body: str, labels=("INBOX", "UNREAD"), thread="t1", html=False,
            received_ms: int = 1759300000000) -> dict:
    mime = "text/html" if html else "text/plain"
    return {
        "id": id,
        "threadId": thread,
        "labelIds": list(labels),
        "internalDate": str(received_ms),
        "snippet": body[:50],
        "payload": {
            "mimeType": "multipart/alternative",
            "headers": [
                {"name": "From", "value": f"Someone <{sender}>"},
                {"name": "To", "value": "me@example.com"},
                {"name": "Subject", "value": subject},
            ],
            "parts": [{"mimeType": mime, "body": {"data": b64(body)}}],
        },
    }


class FakeGmail:
    def __init__(self, messages: list[dict], sent_to: set[str] = frozenset()):
        self.messages = {m["id"]: copy.deepcopy(m) for m in messages}
        self.sent_to = set(sent_to)
        self.requests: list[httpx.Request] = []
        self.labels = [{"id": "Label_9", "name": "Work"}]  # the user's own label, which Oscar must never touch
        self.profile = {"name": "Sam Lee", "picture": "https://lh3.googleusercontent.com/a/sam"}  # Google's userinfo

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if url.startswith(TOKEN_URL):
            if b"grant_type=authorization_code" in request.content:  # signing in
                return httpx.Response(200, json={"access_token": "fresh", "refresh_token": "r", "expires_in": 3600,
                                                 "scope": f"openid {SCOPE} https://www.googleapis.com/auth/userinfo.profile"})
            return httpx.Response(200, json={"access_token": "fresh", "expires_in": 3600})
        if url.startswith(USERINFO_URL):
            return httpx.Response(200, json=self.profile) if self.profile else httpx.Response(401)
        path = request.url.path.removeprefix("/gmail/v1/users/me")
        if path == "/profile":
            return httpx.Response(200, json={"emailAddress": "me@example.com"})
        if path == "/labels" and request.method == "GET":
            return httpx.Response(200, json={"labels": self.labels})
        if path == "/labels" and request.method == "POST":
            made = {"id": f"Label_{len(self.labels) + 100}", "name": json_body(request)["name"]}
            self.labels.append(made)
            return httpx.Response(200, json=made)
        if path.startswith("/labels/") and request.method == "PATCH":  # renaming one of his labels
            label = next(l for l in self.labels if l["id"] == path.split("/")[2])
            label["name"] = json_body(request)["name"]
            return httpx.Response(200, json=label)
        if path.endswith("/modify") and request.method == "POST":
            m = self.messages[path.split("/")[2]]
            body = json_body(request)
            m["labelIds"] = [l for l in m["labelIds"] if l not in body["removeLabelIds"]] + [
                l for l in body["addLabelIds"] if l not in m["labelIds"]]
            return httpx.Response(200, json={"id": m["id"], "labelIds": m["labelIds"]})
        if path == "/messages":
            q = request.url.params.get("q")
            if q:
                to = q.split("to:")[1]
                return httpx.Response(200, json={"messages": [{"id": "s"}] if to in self.sent_to else []})
            return httpx.Response(200, json={"messages": [{"id": i, "threadId": m["threadId"]} for i, m in self.messages.items()]})
        if path.startswith("/messages/"):
            m = self.messages.get(path.split("/")[2])
            if m is None:
                return httpx.Response(404, json={})
            if request.url.params.get("format") == "minimal":
                return httpx.Response(200, json={"id": m["id"], "labelIds": m["labelIds"]})
            return httpx.Response(200, json=m)
        if path.startswith("/threads/"):
            return httpx.Response(200, json={"messages": [{}, {}]})
        return httpx.Response(404, json={})

    def http(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self.handler))

    def gmail_requests(self) -> list[httpx.Request]:
        return [r for r in self.requests if str(r.url).startswith(GMAIL_URL)]


def connected(tmp_path, expired: bool = False) -> TokenStore:
    store = TokenStore(tmp_path / "token.json")
    store.save({"refresh_token": "r", "access_token": "a", "expires_at": time.time() + (-10 if expired else 3600)})
    return store


def json_body(request: httpx.Request) -> dict:
    return json.loads(request.content or b"{}")
