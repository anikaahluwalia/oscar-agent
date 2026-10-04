"""The simulated email world for evals: a Gmail account that lives in memory (oscar/pretend_gmail.py,
shared with the demo). Oscar talks to it through his real Gmail client, so an eval runs the same
sync -> decide -> act path as the app. Grading reads its world() and trace, never what Oscar says
he did. Drafts are refused here, like sending: the evals never write replies."""

from __future__ import annotations

from oscar.gmail import GmailClient
from oscar.pretend_gmail import BLOCKED_RULE, ME, MemoryTokens, PretendGmail, gmail_message  # noqa: F401


class SimulatedClient(GmailClient):
    """Oscar's real Gmail client, pointed at the simulated world. inbox.sync only lets the safety
    rules be turned off for a client like this one."""

    simulated = True


class SimulatedEmailProvider(PretendGmail):
    def client(self) -> SimulatedClient:
        """Oscar's Gmail client, connected to this world."""
        return SimulatedClient(MemoryTokens(), self.http())
