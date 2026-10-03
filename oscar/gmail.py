"""Reading a real Gmail inbox (Stage 9), and changing its labels (Stage 12).

Connecting asks Google for read-only access (gmail.readonly). Oscar only asks for
gmail.modify when you choose to let him act. Even then, the only write in this
client is modify_labels, and it only adds or removes UNREAD, INBOX and labels
Oscar made himself (under "Oscar/"): marking read, archiving and labelling, all
undoable. There is no code here that can send, trash or delete anything;
tests/test_gmail.py checks that.

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
ACT_SCOPE = "https://www.googleapis.com/auth/gmail.modify"  # only asked for when you let Oscar act
LABEL_PREFIX = "Oscar/"
SYSTEM_LABELS = frozenset({"UNREAD", "INBOX"})  # the only Gmail labels Oscar may add or remove
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


def auth_url(state: str, act: bool = False) -> str:
    """Where to send the user to connect Gmail: read-only, or (act) with permission to change labels."""
    return AUTH_URL + "?" + urlencode({
        "client_id": client_id(),
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": ACT_SCOPE if act else SCOPE,
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
    if not {SCOPE, ACT_SCOPE} & set(tokens.get("scope", "").split()):
        raise GmailError("Gmail access wasn't granted. Tick the Gmail box on Google's screen and try again.")
    return tokens


def can_act(saved: dict | None) -> bool:
    """Whether the saved connection lets Oscar change labels (it was made with gmail.modify)."""
    return bool(saved) and ACT_SCOPE in saved.get("scope", "").split()


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
    """Access to one Gmail account. Reads go through _get. The one write is modify_labels."""

    def __init__(self, tokens: TokenStore, http: httpx.Client | None = None) -> None:
        self.tokens = tokens
        self.http = http or httpx.Client(timeout=20)
        self._oscar_labels: dict[str, str] | None = None  # Oscar's label ids by name

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

    # --- Stage 12: the only writes ------------------------------------------------

    def _post(self, path: str, body: dict) -> dict:
        response = self.http.post(GMAIL_URL + path, json=body, headers={"Authorization": f"Bearer {self._access_token()}"})
        if response.status_code != 200:
            raise GmailError(f"Gmail said no ({response.status_code}).", response.status_code)
        return response.json()

    def _mine(self) -> dict[str, str]:
        """Oscar's own labels (named "Oscar/..."), by name, looked up once per client."""
        if self._oscar_labels is None:
            self._oscar_labels = {l["name"]: l["id"] for l in self._get("/labels").get("labels", [])
                                  if l.get("name", "").startswith(LABEL_PREFIX)}
        return self._oscar_labels

    def label_id(self, name: str) -> str:
        """The id of Oscar's label "Oscar/<name>", made the first time it's needed."""
        full = LABEL_PREFIX + name
        if full not in self._mine():
            made = self._post("/labels", {"name": full, "labelListVisibility": "labelShow", "messageListVisibility": "show"})
            self._oscar_labels[full] = made["id"]
        return self._oscar_labels[full]

    def modify_labels(self, message_id: str, add: list[str], remove: list[str]) -> None:
        """Add and remove labels on one email. Only UNREAD, INBOX and Oscar's own labels: anything
        else is refused here, before Gmail is asked."""
        changing = [label for label in add + remove if label not in SYSTEM_LABELS]
        mine = set(self._mine().values()) if changing else set()
        for label in add + remove:
            if label not in SYSTEM_LABELS and label not in mine:
                raise GmailError(f"Oscar isn't allowed to change the label {label!r}.")
        if add or remove:
            self._post(f"/messages/{message_id}/modify", {"addLabelIds": add, "removeLabelIds": remove})


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
    # Plain-text parts often have HTML entities written out too ("&zwnj;", "&amp;"), and
    # marketing emails pad the start with invisible characters.
    return clean_text(text)[:BODY_LIMIT]


DISPLAY_LIMIT = 200_000  # characters of an email shown in the app; it's fetched live and never stored


def _strip_active(markup: str) -> str:
    """Remove what could run or redirect. The app also shows email in a sandboxed frame with
    scripts off; this is a second layer, not the only one."""
    markup = re.sub(r"(?is)<(script|iframe|object|embed|frame|frameset|applet|form)\b.*?(</\1\s*>|$)", "", markup)
    markup = re.sub(r"(?is)<(script|iframe|object|embed|frame|frameset|applet|form|base|link)\b[^>]*>", "", markup)
    markup = re.sub(r"(?is)<meta\b[^>]*http-equiv[^>]*>", "", markup)
    markup = re.sub(r"(?i)\s+on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", markup)
    markup = re.sub(r"(?i)(href|src)\s*=\s*([\"']?)\s*javascript:[^\"'>\s]*\2", r'\1="#"', markup)
    return markup


def email_content(raw: dict) -> dict:
    """The whole email for showing in the app: its HTML (with anything active removed) and its text."""
    html_parts, text_parts = [], []

    def walk(part: dict) -> None:
        mime = part.get("mimeType", "")
        data = part.get("body", {}).get("data")
        if data and mime == "text/html":
            html_parts.append(_decode(data, _charset(part)))
        elif data and mime == "text/plain":
            text_parts.append(_decode(data, _charset(part)))
        for child in part.get("parts", []):
            walk(child)

    walk(raw.get("payload", {}))
    markup = "\n".join(html_parts)
    text = "\n\n".join(text_parts) or (_strip_html(markup) if markup else raw.get("snippet", ""))
    text = INVISIBLE.sub("", html.unescape(text)).replace("\u00a0", " ")
    return {
        "html": _strip_active(markup)[:DISPLAY_LIMIT] if markup else None,
        "text": re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()[:DISPLAY_LIMIT],
    }


def clean_text(text: str) -> str:
    """Entities decoded, invisible padding removed, spaces collapsed."""
    text = INVISIBLE.sub("", html.unescape(text)).replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def parse_message(raw: dict) -> tuple[Email, GmailInfo]:
    """A Gmail API message, as the Email Oscar decides on and the facts logged with it."""
    headers = {h["name"].lower(): h["value"] for h in raw.get("payload", {}).get("headers", [])}
    sender = parseaddr(headers.get("from", ""))[1].lower() or "unknown"
    to = [addr.lower() for _, addr in getaddresses([headers.get("to", "")]) if addr]
    labels = raw.get("labelIds", [])
    received = raw.get("internalDate")
    category = next((CATEGORIES[label] for label in labels if label in CATEGORIES), None)
    email = Email(
        id=raw["id"],
        sender=sender,
        to=to,
        subject=headers.get("subject", "(no subject)"),
        body=body_text(raw.get("payload", {})) or raw.get("snippet", ""),
        category=category,
        # Sent to a list: it has an unsubscribe header, or says it's bulk mail.
        bulk="list-unsubscribe" in headers or headers.get("precedence", "").lower() in ("bulk", "list"),
    )
    info = GmailInfo(
        message_id=raw["id"],
        thread_id=raw.get("threadId", raw["id"]),
        received_at=datetime.fromtimestamp(int(received) / 1000, tz=timezone.utc) if received else None,
        labels=labels,
        category=category,
        preview=clean_text(raw.get("snippet", "")),
    )
    return email, info
