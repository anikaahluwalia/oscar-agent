"""Reading a real Gmail inbox (Stage 9), and changing its labels (Stage 12).

Connecting asks Google for read-only access (gmail.readonly). Oscar only asks for
gmail.modify when you choose to let him act. Even then, the only writes in this
client are modify_labels, which only adds or removes UNREAD, INBOX and Oscar's own
labels, label_id, which makes one of his labels (oscar/labels.py), rename_label, which
renames one of his labels when you change its name in Settings, create_draft and
delete_draft, which save a reply he wrote as a draft in the email's thread and take it away
again on undo, and trash and untrash, which move an email you held to approve deleting into
Gmail's Trash and back out on undo (Gmail empties the Trash after 30 days). So: marking read,
archiving, labelling, drafting and moving to Trash, all undoable. There is no code here that can
send an email or a draft, or delete a message for good; tests/test_gmail.py checks that.

Google's OAuth: the user is sent to Google to say yes, Google sends them back to
/auth/google/callback with a code, and the code is swapped for tokens. The
refresh token is kept in the data folder (never in git) so Oscar can keep reading.
"""

from __future__ import annotations

import base64
import html
from email.message import EmailMessage
import json
import os
import re
import time
from datetime import datetime, timezone
from email.utils import getaddresses, parseaddr
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode, urlparse

import httpx

from oscar.config import API_URL, setting
from oscar.labels import COLOURS, DEFAULT_NAMES, OLD_NAMES
from oscar.models import Email, GmailInfo

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
ACT_SCOPE = "https://www.googleapis.com/auth/gmail.modify"  # only asked for when you let Oscar act
PROFILE_SCOPES = ("openid", "email", "profile")  # your name and photo, for the corner of the app
# The labels Oscar makes and uses are listed in oscar/labels.py, by role. If you already have a
# label with one of their names, he uses yours and leaves its colour alone.
OLD_PREFIX = "Oscar/"  # his labels used to be "Oscar/Receipts" and so on; still his, so undo works
SYSTEM_LABELS = frozenset({"UNREAD", "INBOX"})  # apart from his own, the only labels Oscar may add or remove
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GMAIL_URL = "https://gmail.googleapis.com/gmail/v1/users/me"
REDIRECT_PATH = "/auth/google/callback"
BODY_LIMIT = 5000  # characters of the body Oscar reads; only the first 160 are stored


class GmailError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, reason: str | None = None) -> None:
        super().__init__(message)
        self.status = status  # Gmail's HTTP status, when the error came from Gmail
        self.reason = reason  # Gmail's own word for it, like "rateLimitExceeded", when it gave one


# Gmail's reasons for "slow down": its quota for this app, or for your account, was used up for now.
RATE_LIMITED = frozenset({"rateLimitExceeded", "userRateLimitExceeded", "RESOURCE_EXHAUSTED"})


def _reason(response: httpx.Response) -> str | None:
    """Gmail's reason for an error, from its JSON body, if there is one."""
    try:
        error = response.json().get("error", {})
    except ValueError:
        return None
    errors = error.get("errors") or [{}]
    return errors[0].get("reason") or error.get("status")


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
        "scope": " ".join([ACT_SCOPE if act else SCOPE, *PROFILE_SCOPES]),
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


def profile(access_token: str, http: httpx.Client) -> dict:
    """Your name and Google photo. Optional: if Google doesn't send them, the app shows your initial.
    Only a photo from Google's own image server is kept."""
    try:
        response = http.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
    except httpx.HTTPError:
        return {}
    if response.status_code != 200:
        return {}
    info, found = response.json(), {}
    if isinstance(info.get("name"), str) and info["name"].strip():
        found["name"] = info["name"].strip()[:100]
    picture = info.get("picture")
    if isinstance(picture, str) and (urlparse(picture).hostname or "").endswith(".googleusercontent.com") \
            and picture.startswith("https://"):
        found["picture"] = picture
    return found


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
    """Access to one Gmail account. Reads go through _get. The only writes change labels: modify_labels,
    label_id (making one of his labels) and rename_label."""

    def __init__(self, tokens: TokenStore, http: httpx.Client | None = None, names: dict[str, str] | None = None,
                 read_only: bool = False) -> None:
        self.tokens = tokens
        self.http = http or httpx.Client(timeout=20)
        # read_only: every write is refused here, before Gmail is asked. The six-month look back at
        # your inbox (oscar/cold_start.py) always uses a client like this, so it can't change anything.
        self.read_only = read_only
        self.names = {**DEFAULT_NAMES, **(names or {})}  # what each of his labels is called, from Settings
        self._oscar_labels: dict[str, str] | None = None  # Oscar's label ids, by role

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
            reason = _reason(response)
            said = f"{response.status_code}, {reason}" if reason else str(response.status_code)
            raise GmailError(f"Gmail said no ({said}).", response.status_code, reason)
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

    def search(self, query: str, page: str | None = None, limit: int = 500) -> tuple[list[dict], str | None]:
        """A page of messages matching a Gmail search (like "newer_than:6m"), newest first, as
        {id, threadId}, and the token for the next page. Spam and trash are left out, as in Gmail."""
        found = self._get("/messages", q=query, maxResults=limit, pageToken=page)
        return found.get("messages", []), found.get("nextPageToken")

    def metadata(self, message_id: str) -> dict:
        """One email's labels, headers and Gmail's short preview, without the body. Cheaper than
        message(), and enough for the rules to tell what kind of email it is."""
        return self._get(f"/messages/{message_id}", format="metadata",
                         metadataHeaders=["From", "To", "Subject", "List-Unsubscribe", "Precedence"])

    def thread_length(self, thread_id: str) -> int:
        return len(self._get(f"/threads/{thread_id}", format="minimal").get("messages", [])) or 1

    def emailed_before(self, address: str) -> bool:
        return bool(self._get("/messages", q=f"in:sent to:{address}", maxResults=1).get("messages"))

    # --- The only writes: labels (Stage 12), and renaming his labels (Stage 15) ---

    def _refuse_if_read_only(self) -> None:
        if self.read_only:
            raise GmailError("This Gmail connection is read-only, so Oscar can't change anything with it.")

    def _post(self, path: str, body: dict) -> dict:
        self._refuse_if_read_only()
        response = self.http.post(GMAIL_URL + path, json=body, headers={"Authorization": f"Bearer {self._access_token()}"})
        if response.status_code != 200:
            raise GmailError(f"Gmail said no ({response.status_code}).", response.status_code)
        return response.json()

    def _mine(self) -> dict[str, str]:
        """Oscar's own labels in this Gmail, as {role: label id}, looked up once per client. Gmail
        ignores case in label names, so "needs you" is the same label as "Needs you". His old
        labels ("Handled", and "Oscar/..." from before that) are kept too, so he can still take
        them off and undo what he did with them."""
        if self._oscar_labels is None:
            roles = {name.lower(): role for role, name in OLD_NAMES.items()}
            roles.update({name.lower(): role for role, name in self.names.items()})  # your names win
            self._oscar_labels = {}
            for label in self._get("/labels").get("labels", []):
                name = label.get("name", "")
                if name.lower() in roles:
                    self._oscar_labels[roles[name.lower()]] = label["id"]
                elif name.startswith(OLD_PREFIX):
                    self._oscar_labels[name] = label["id"]
        return self._oscar_labels

    def find_label(self, role: str) -> str | None:
        """The id of one of Oscar's labels, if it's in Gmail. Never makes one."""
        return self._mine().get(role)

    def label_id(self, role: str) -> str:
        """The id of one of Oscar's labels, made (named as in Settings, in its colour) the first
        time it's needed. Only the roles in oscar/labels.py, so nothing else can be made."""
        if role not in COLOURS:
            raise GmailError(f"{role!r} isn't one of Oscar's labels.")
        if role not in self._mine():
            new = {"name": self.names[role], "labelListVisibility": "labelShow", "messageListVisibility": "show"}
            background, text = COLOURS[role]
            try:
                made = self._post("/labels", {**new, "color": {"backgroundColor": background, "textColor": text}})
            except GmailError as e:
                if e.status != 400:
                    raise
                made = self._post("/labels", new)  # Gmail turned down the colour: plain is still fine
            self._oscar_labels[role] = made["id"]
        return self._oscar_labels[role]

    def rename_label(self, old: str, new: str) -> Literal["renamed", "taken", "none"]:
        """Rename one of Oscar's labels in Gmail, when you rename it in Settings. Emails he already
        labelled keep it, since it's the same label. "taken": you already have a label with the
        new name, so he'll use that one from now on and leaves both alone. "none": he hasn't
        made this label yet, so there's nothing to rename."""
        self._refuse_if_read_only()
        labels = self._get("/labels").get("labels", [])
        found = next((label for label in labels if label.get("name", "").lower() == old.lower()), None)
        if any(label.get("name", "").lower() == new.lower() for label in labels if label is not found):
            return "taken"
        if found is None:
            return "none"
        response = self.http.patch(f"{GMAIL_URL}/labels/{found['id']}", json={"name": new},
                                   headers={"Authorization": f"Bearer {self._access_token()}"})
        if response.status_code != 200:
            raise GmailError(f"Gmail said no ({response.status_code}).", response.status_code)
        self._oscar_labels = None  # look them up again next time
        return "renamed"

    def create_draft(self, message_id: str, thread_id: str, to: str, subject: str, body: str) -> str:
        """Save a reply as a draft in the email's own thread, and return the draft's id. Only ever a
        draft: Gmail keeps it in Drafts until you send it yourself, and nothing here can send it."""
        self._refuse_if_read_only()
        original = self._get(f"/messages/{message_id}", format="metadata",
                             metadataHeaders=["Message-ID", "References", "Reply-To"])
        headers = {h["name"].lower(): h["value"] for h in original.get("payload", {}).get("headers", [])}
        reply = EmailMessage()
        reply["To"] = headers.get("reply-to") or to
        reply["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        if headers.get("message-id"):  # so Gmail and the other person's mail app keep it in the conversation
            reply["In-Reply-To"] = headers["message-id"]
            reply["References"] = f"{headers.get('references', '')} {headers['message-id']}".strip()
        reply.set_content(body)
        raw = base64.urlsafe_b64encode(reply.as_bytes()).decode()
        return self._post("/drafts", {"message": {"raw": raw, "threadId": thread_id}})["id"]

    def delete_draft(self, draft_id: str) -> None:
        """Take away a draft Oscar made, for undo. Only drafts: there's no way here to delete an email.
        A draft that's already gone (you sent or deleted it) is fine."""
        self._refuse_if_read_only()
        response = self.http.delete(f"{GMAIL_URL}/drafts/{draft_id}", headers={"Authorization": f"Bearer {self._access_token()}"})
        if response.status_code not in (200, 204, 404):
            raise GmailError(f"Gmail said no ({response.status_code}).", response.status_code, _reason(response))

    def trash(self, message_id: str) -> None:
        """Move one email to Gmail's Trash, after you held to approve deleting it. Not for good:
        untrash brings it back until Gmail empties the Trash, 30 days later."""
        self._post(f"/messages/{message_id}/trash", {})

    def untrash(self, message_id: str) -> None:
        """Take an email Oscar moved to the Trash back out, for undo."""
        self._post(f"/messages/{message_id}/untrash", {})

    def modify_labels(self, message_id: str, add: list[str], remove: list[str]) -> None:
        """Add and remove labels on one email. Only UNREAD, INBOX and Oscar's own labels: anything
        else is refused here, before Gmail is asked. So is anything at all on a read-only client."""
        self._refuse_if_read_only()
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
