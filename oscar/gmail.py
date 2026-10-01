"""Reading a real Gmail inbox (Stage 9).

Oscar only asks Google for read-only access (gmail.readonly), and this client
only ever sends GET requests to Gmail. There is no code here that can label,
archive, send or delete anything; tests/test_gmail.py checks that.

Google's OAuth: the user is sent to Google to say yes, Google sends them back to
/auth/google/callback with a code, and the code is swapped for tokens. The
refresh token is kept in the data folder (never in git) so Oscar can keep reading.
"""

from __future__ import annotations

import base64
import html
import json
import os
import re
import time
from datetime import datetime, timezone
from email.utils import getaddresses, parseaddr
from pathlib import Path
from urllib.parse import urlencode

import httpx

from oscar.config import API_URL, setting
from oscar.models import Email, GmailInfo

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GMAIL_URL = "https://gmail.googleapis.com/gmail/v1/users/me"
REDIRECT_PATH = "/auth/google/callback"
BODY_LIMIT = 5000  # characters of the body Oscar reads; only the first 160 are stored


class GmailError(RuntimeError):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status  # Gmail's HTTP status, when the error came from Gmail


def client_id() -> str:
    return setting("GOOGLE_CLIENT_ID")


def configured() -> bool:
    """True once the Google client ID and secret are in .env."""
    return bool(client_id() and setting("GOOGLE_CLIENT_SECRET"))


def redirect_uri() -> str:
    return API_URL + REDIRECT_PATH


def auth_url(state: str) -> str:
    """Where to send the user to connect Gmail."""
    return AUTH_URL + "?" + urlencode({
        "client_id": client_id(),
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",  # so Google gives a refresh token
        "prompt": "consent",
        "include_granted_scopes": "false",
        "state": state,
    })


def exchange_code(code: str, http: httpx.Client) -> dict:
    """Swap the code Google sent back for tokens."""
    response = http.post(TOKEN_URL, data={
        "code": code,
        "client_id": client_id(),
        "client_secret": setting("GOOGLE_CLIENT_SECRET"),
        "redirect_uri": redirect_uri(),
        "grant_type": "authorization_code",
    })
    if response.status_code != 200:
        raise GmailError(f"Google didn't accept the sign-in ({response.status_code}).")
    tokens = response.json()
    if SCOPE not in tokens.get("scope", "").split():
        raise GmailError("Gmail access wasn't granted. Tick the Gmail box on Google's screen and try again.")
    return tokens


def revoke(token: str, http: httpx.Client) -> None:
    """Tell Google to forget Oscar's access. Best effort: the local token is deleted either way."""
    try:
        http.post(REVOKE_URL, data={"token": token})
    except httpx.HTTPError:
        pass


class TokenStore:
    """The saved Gmail connection: tokens and the address it's for."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> dict | None:
        if not self.path.exists():
            return None
        return json.loads(self.path.read_text())

    def save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data))
        os.chmod(self.path, 0o600)  # only you can read it

    def delete(self) -> None:
        self.path.unlink(missing_ok=True)


class GmailClient:
    """Read-only access to one Gmail account. Every Gmail call goes through _get."""

    def __init__(self, tokens: TokenStore, http: httpx.Client | None = None) -> None:
        self.tokens = tokens
        self.http = http or httpx.Client(timeout=20)

    def _access_token(self) -> str:
        saved = self.tokens.load()
        if not saved:
            raise GmailError("Gmail isn't connected.")
        if saved.get("access_token") and saved.get("expires_at", 0) > time.time() + 60:
            return saved["access_token"]
        response = self.http.post(TOKEN_URL, data={
            "client_id": client_id(),
            "client_secret": setting("GOOGLE_CLIENT_SECRET"),
            "refresh_token": saved["refresh_token"],
            "grant_type": "refresh_token",
        })
        if response.status_code != 200:
            raise GmailError("Google stopped accepting Oscar's access. Connect Gmail again in Settings.")
        fresh = response.json()
        saved.update(access_token=fresh["access_token"], expires_at=time.time() + fresh.get("expires_in", 3600))
        self.tokens.save(saved)
        return saved["access_token"]

    def _get(self, path: str, **params) -> dict:
        response = self.http.get(
            GMAIL_URL + path,
            params={k: v for k, v in params.items() if v is not None},
            headers={"Authorization": f"Bearer {self._access_token()}"},
        )
        if response.status_code != 200:
            raise GmailError(f"Gmail said no ({response.status_code}).", response.status_code)
        return response.json()

    def address(self) -> str:
        return self._get("/profile")["emailAddress"]

    def inbox(self, limit: int, page: str | None = None) -> tuple[list[dict], str | None]:
        """A page of inbox messages, newest first, as {id, threadId}, and the token for the next page."""
        found = self._get("/messages", labelIds="INBOX", maxResults=limit, pageToken=page)
        return found.get("messages", []), found.get("nextPageToken")

    def message(self, message_id: str) -> dict:
        return self._get(f"/messages/{message_id}", format="full")

    def labels(self, message_id: str) -> list[str]:
        return self._get(f"/messages/{message_id}", format="minimal").get("labelIds", [])

    def thread_length(self, thread_id: str) -> int:
        return len(self._get(f"/threads/{thread_id}", format="minimal").get("messages", [])) or 1

    def emailed_before(self, address: str) -> bool:
        return bool(self._get("/messages", q=f"in:sent to:{address}", maxResults=1).get("messages"))


# Gmail's tabs, from its category labels.
CATEGORIES = {
    "CATEGORY_PERSONAL": "primary",
    "CATEGORY_PROMOTIONS": "promotions",
    "CATEGORY_UPDATES": "updates",
    "CATEGORY_SOCIAL": "social",
    "CATEGORY_FORUMS": "forums",
}


INVISIBLE = re.compile("[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u3164\ufeff]")


def _charset(part: dict) -> str:
    for h in part.get("headers", []):
        if h.get("name", "").lower() == "content-type":
            found = re.search(r'charset="?([\w-]+)"?', h.get("value", ""), re.I)
            if found:
                return found.group(1)
    return "utf-8"


def _decode(data: str, charset: str = "utf-8") -> str:
    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    try:
        return raw.decode(charset, errors="replace")
    except LookupError:  # a charset Python doesn't know
        return raw.decode("utf-8", errors="replace")


def _strip_html(text: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return html.unescape(text)


def body_text(payload: dict) -> str:
    """The plain text of an email: the text/plain part if there is one, else the HTML with tags removed."""
    plain, rich = [], []

    def walk(part: dict) -> None:
        mime = part.get("mimeType", "")
        data = part.get("body", {}).get("data")
        if data and mime == "text/plain":
            plain.append(_decode(data, _charset(part)))
        elif data and mime == "text/html":
            rich.append(_strip_html(_decode(data, _charset(part))))
        for child in part.get("parts", []):
            walk(child)

    walk(payload)
    text = "\n".join(plain) if plain else "\n".join(rich)
    # Plain-text parts often have HTML entities written out too ("&zwnj;", "&amp;").
    text = html.unescape(text)
    # Invisible characters marketing emails use as padding, and soft hyphens.
    text = INVISIBLE.sub("", text).replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()[:BODY_LIMIT]


def parse_message(raw: dict) -> tuple[Email, GmailInfo]:
    """A Gmail API message, as the Email Oscar decides on and the facts logged with it."""
    headers = {h["name"].lower(): h["value"] for h in raw.get("payload", {}).get("headers", [])}
    sender = parseaddr(headers.get("from", ""))[1].lower() or "unknown"
    to = [addr.lower() for _, addr in getaddresses([headers.get("to", "")]) if addr]
    labels = raw.get("labelIds", [])
    received = raw.get("internalDate")
    email = Email(
        id=raw["id"],
        sender=sender,
        to=to,
        subject=headers.get("subject", "(no subject)"),
        body=body_text(raw.get("payload", {})) or raw.get("snippet", ""),
    )
    info = GmailInfo(
        message_id=raw["id"],
        thread_id=raw.get("threadId", raw["id"]),
        received_at=datetime.fromtimestamp(int(received) / 1000, tz=timezone.utc) if received else None,
        labels=labels,
        category=next((CATEGORIES[label] for label in labels if label in CATEGORIES), None),
    )
    return email, info
