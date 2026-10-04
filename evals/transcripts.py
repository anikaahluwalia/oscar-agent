"""Write example transcripts to examples/TRANSCRIPTS.md.

Each transcript is a short scripted conversation with the demo's emails (emails/demo/), run through
the real Oscar the way the demo runs them (demo.arrive, with the model's saved readings), so the text
is exactly what he says. Run with: python -m evals.transcripts
"""

from pathlib import Path

import httpx

from oscar import demo
from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.history import History
from oscar.preferences import Preferences
from oscar.review import teaching
from oscar.voice import describe_learning

OUT = Path(__file__).resolve().parent.parent / "examples" / "TRANSCRIPTS.md"
READ = demo.reader(httpx.Client(timeout=40))


def sentence(text: str) -> str:
    return text[0].upper() + text[1:]


class Transcript:
    def __init__(self, title: str, note: str) -> None:
        self.history = History()
        self.lines = [f"## {title}", "", note, ""]

    def email(self, email_id: str, feedback: FeedbackKind | list[FeedbackKind] | None = None, text: str | None = None,
              show: bool = True, scope: str = "sender") -> None:
        email = demo.demo_email(email_id)
        decision = demo.arrive(self.history, email, READ)
        answers = feedback if isinstance(feedback, list) else [feedback] if feedback else []
        # Only the rule can be about every email like this; an approval is about this one.
        scope_of = lambda kind: scope if kind in (FeedbackKind.ALWAYS_DO_THIS, FeedbackKind.ALWAYS_ASK_ME) else "sender"  # noqa: E731
        if not show:  # still decided and answered, just not printed
            for kind in answers:
                record_feedback(self.history, decision.id, kind, text, scope=scope_of(kind))
            return
        self.lines.append(f"**Email** from `{email.sender}`: \"{email.subject}\"  ")
        said_by_oscar = " ".join(decision.explanation.split())  # a quote can span a line break in the email
        self.lines.append(f"**Oscar** (`{decision.action.value}` → `{decision.autonomy_level.value}`): {said_by_oscar}  ")
        for kind in answers:
            try:
                _, reply = record_feedback(self.history, decision.id, kind, text, scope=scope_of(kind))
            except FeedbackError as e:
                reply = str(e)
            said = f"`{kind.value}`" + (" for every email like this" if scope_of(kind) == "kind" else "")
            self.lines.append(f"**You:** {said}  ")
            self.lines.append(f"**Oscar:** {reply}  ")
        self.lines.append("")

    def note(self, text: str) -> None:
        self.lines += [f"*{text}*", ""]

    def learned(self) -> None:
        self.lines.append("**You:** what have you learned?  ")
        rows = Preferences.from_feedback(teaching(self.history)).summary()
        self.lines.append("**Oscar:** " + " ".join(sentence(describe_learning(row)) for row in rows))
        self.lines.append("")

    def text(self) -> str:
        return "\n".join(self.lines)


def learning() -> Transcript:
    t = Transcript("1. One answer about a kind of email, and a sender he's never seen",
                   "Oscar asks about a sale from a shop he doesn't know. You approve it and tell him to handle every "
                   "email like this. The next sale, from a different shop, he handles on his own. A third 'sale' hides "
                   "instructions for him: the safety checks run after anything you taught him, so it's stopped.")
    t.email("demo_promo_evergreen", [FeedbackKind.APPROVE, FeedbackKind.ALWAYS_DO_THIS], scope="kind")
    t.email("demo_promo_trailhead")
    t.email("demo_promo_injection")
    return t


def asks_first() -> Transcript:
    t = Transcript("2. Anything that leaves your inbox asks first",
                   "Sending a reply, forwarding an email and accepting an invitation all go out under your name, so "
                   "Oscar asks before each one, however sure he is. A question he can answer only gets a draft, never sent.")
    t.email("demo_send_reply")
    t.email("demo_forward_invoice")
    t.email("demo_interview_invite")
    t.email("demo_work_draft")
    return t


def always_stopped() -> Transcript:
    t = Transcript("3. Money and codes always stop, whatever you tell him",
                   "A request to pay a new bank account, and one for a verification code, are stopped. Telling him to "
                   "handle them doesn't change that: the safety floor sits under everything he learns.")
    t.email("demo_money_request", FeedbackKind.ALWAYS_DO_THIS)
    t.email("demo_credential_request")
    return t


def mentions() -> Transcript:
    t = Transcript("4. A mention isn't a request",
                   "Oscar looks for what an email asks for, not for scary words. A receipt that mentions a payment and a "
                   "note that says a file was deleted are routine; asking him to delete an email for good isn't.")
    t.email("demo_payment_received")
    t.email("demo_delete_control")
    t.email("demo_delete_request")
    return t


def main() -> None:
    parts = ["# Oscar transcripts", "",
             "Generated by `python -m evals.transcripts`. Everything Oscar says here is his real output.", ""]
    parts += [t().text() for t in (learning, asks_first, always_stopped, mentions)]
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(parts))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
