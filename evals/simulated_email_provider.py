"""A Gmail account that lives in memory, for evals: the simulated email world.

Oscar talks to it through his real Gmail client (oscar.gmail.GmailClient), over the same REST
calls he makes to Gmail, so an eval runs the same sync -> decide -> act path as the app. Only
the world is pretend. Everything is inspectable:

  - world(): what each email looks like now (read, archived, Oscar's labels, deleted), and
    anything sent, drafted or deleted. Grading reads this, never what Oscar says he did.
  - trace: every call, in order, with its arguments, result, and whether it was allowed.

Calls Oscar's client never makes (sending, drafts, trash, delete) are refused and traced as
blocked, so if a change ever made him try, the trace shows it.
"""

from __future__ import annotations

import base64
import copy
import json
import time
from pathlib import Path

import httpx

from oscar.gmail import SCOPE, TOKEN_URL, USERINFO_URL, GmailClient, TokenStore

ME = "me@example.com"
BLOCKED_RULE = "not something Oscar's Gmail access can do"


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def gmail_message(id: str, sender: str, subject: str, body: str, *, bulk: bool = False, category: str | None = None,
                  received_ms: int | None = None) -> dict:
    """An email the way Gmail's API returns it."""
    labels = ["INBOX", "UNREAD"] + ([f"CATEGORY_{category.upper()}"] if category else [])
    headers = [{"name": "From", "value": sender}, {"name": "To", "value": ME}, {"name": "Subject", "value": subject}]
    if bulk:
        headers.append({"name": "List-Unsubscribe", "value": "<mailto:unsubscribe@example.com>"})
    return {
        "id": id, "threadId": f"t-{id}", "labelIds": labels,
        "internalDate": str(received_ms or int(time.time() * 1000)), "snippet": body[:50],
        "payload": {"mimeType": "multipart/alternative", "headers": headers,
                    "parts": [{"mimeType": "text/plain", "body": {"data": _b64(body)}}]},
    }


class SimulatedClient(GmailClient):
    """Oscar's real Gmail client, pointed at the simulated world. inbox.sync only lets the safety
    rules be turned off for a client like this one."""

    simulated = True


class SimulatedEmailProvider:
    def __init__(self, messages: list[dict], emailed: set[str] = frozenset()) -> None:
        self.messages = {m["id"]: copy.deepcopy(m) for m in messages}
        self.emailed = {e.lower() for e in emailed}  # people you've written to, for "emailed before"
        self.labels = [{"id": "Label_1", "name": "Work"}]  # one of yours, which Oscar must never touch
        self.sent: list[dict] = []
        self.drafts: list[dict] = []
        self.deleted: list[str] = []
        self.trace: list[dict] = []

    # --- the world ------------------------------------------------------------------

    def _label_names(self, ids: list[str]) -> list[str]:
        names = {label["id"]: label["name"] for label in self.labels}
        return sorted(names[i] for i in ids if i in names)

    def world(self) -> dict:
        return {
            "messages": {
                i: {"read": "UNREAD" not in m["labelIds"], "archived": "INBOX" not in m["labelIds"],
                    "labels": self._label_names(m["labelIds"]), "deleted": i in self.deleted}
                for i, m in self.messages.items()
            },
            "sent": copy.deepcopy(self.sent),
            "drafts": copy.deepcopy(self.drafts),
            "deleted": list(self.deleted),
        }

    # --- the API --------------------------------------------------------------------

    def _log(self, tool: str, args: dict, response: httpx.Response, allowed: bool = True, rule: str | None = None) -> httpx.Response:
        self.trace.append({"order": len(self.trace) + 1, "tool": tool, "args": args, "result": response.status_code,
                           "allowed": allowed, "rule": rule})
        return response

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.startswith(TOKEN_URL):
            return httpx.Response(200, json={"access_token": "sim", "expires_in": 3600, "scope": SCOPE})
        if url.startswith(USERINFO_URL):
            return httpx.Response(200, json={})
        path = request.url.path.removeprefix("/gmail/v1/users/me")
        body = json.loads(request.content) if request.content else {}
        method = request.method

        # What Oscar's client can't do: refused, and traced so an attempt is never silent.
        if path in ("/messages/send", "/drafts/send") or path.startswith("/drafts"):
            tool = "create_draft" if path == "/drafts" else "send_email"
            return self._log(tool, body, httpx.Response(403, json={"error": BLOCKED_RULE}), False, BLOCKED_RULE)
        if path.endswith("/trash") or method == "DELETE" or path.endswith("/batchDelete"):
            return self._log("permanent_delete", {"path": path}, httpx.Response(403, json={"error": BLOCKED_RULE}),
                             False, BLOCKED_RULE)

        if path == "/profile":
            return httpx.Response(200, json={"emailAddress": ME})
        if path == "/labels" and method == "GET":
            return self._log("list_labels", {}, httpx.Response(200, json={"labels": self.labels}))
        if path == "/labels" and method == "POST":
            made = {"id": f"Label_{len(self.labels) + 100}", "name": body["name"]}
            self.labels.append(made)
            return self._log("create_label", {"name": body["name"]}, httpx.Response(200, json=made))
        if path.endswith("/modify") and method == "POST":
            message = self.messages.get(path.split("/")[2])
            if message is None:
                return self._log("modify_labels", body, httpx.Response(404, json={}))
            message["labelIds"] = [lbl for lbl in message["labelIds"] if lbl not in body.get("removeLabelIds", [])] + [
                lbl for lbl in body.get("addLabelIds", []) if lbl not in message["labelIds"]]
            args = {"message": message["id"], "add": self._label_names(body.get("addLabelIds", [])) or body.get("addLabelIds", []),
                    "remove": body.get("removeLabelIds", [])}
            return self._log("modify_labels", args, httpx.Response(200, json={"id": message["id"], "labelIds": message["labelIds"]}))
        if path == "/messages":
            q = request.url.params.get("q")
            if q:  # "have you emailed them before?"
                to = q.split("to:")[1].strip().lower()
                return httpx.Response(200, json={"messages": [{"id": "s"}] if to in self.emailed else []})
            refs = [{"id": i, "threadId": m["threadId"]} for i, m in self.messages.items() if "INBOX" in m["labelIds"]]
            return self._log("list_inbox", {}, httpx.Response(200, json={"messages": refs}))
        if path.startswith("/messages/"):
            message = self.messages.get(path.split("/")[2])
            if message is None:
                return httpx.Response(404, json={})
            if request.url.params.get("format") == "minimal":
                return httpx.Response(200, json={"id": message["id"], "labelIds": message["labelIds"]})
            return self._log("read_email", {"message": message["id"]}, httpx.Response(200, json=message))
        if path.startswith("/threads/"):
            return httpx.Response(200, json={"messages": [{}]})
        return httpx.Response(404, json={})

    def client(self, folder: Path) -> SimulatedClient:
        """Oscar's Gmail client, connected to this world."""
        tokens = TokenStore(folder / "token.json")
        tokens.save({"refresh_token": "sim", "access_token": "sim", "expires_at": time.time() + 3600, "scope": SCOPE})
        return SimulatedClient(tokens, httpx.Client(transport=httpx.MockTransport(self.handler)))

