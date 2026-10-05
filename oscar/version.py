"""Which version of Oscar made a decision, so real-inbox results can be compared across fixes."""

import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Bump when the classifier's rules change, so eval runs say which rules they used.
#   rules-1  Stage 1 keyword rules
#   rules-2  Stage 7 changes from eval failures
#   rules-3  list mail is never replied to; tighter gift card check (from real-inbox reviews)
#   rules-4  safety checks look for the shape of a risky request, not exact phrases; a caution backstop
#   rules-5  a greeting to Oscar isn't an instruction; shop footers about gift cards or suspicious
#            activity aren't requests (from real-inbox safety reviews)
#   rules-6  a notice that an app now has access to your account is marked read, and he tells you
#   rules-7  rules-5 went too far: buying a gift card to enter its code, and a blocked sign-in, are stopped again
#   rules-8  from the demo inbox: asking you to forward outranks a mention of an invoice; "I'll send the invite"
#            isn't an invitation; a "never share your code" warning isn't a request; a code asked for in the
#            next sentence, or "send the $4,800 payment", is stopped too; a services agreement asks first
#            like a contract; "no action is required" and "nothing needed from you" are marked read
#   rules-9  "for good" said other ways in a delete request: every copy, the whole thing, keep nothing,
#            trash included, so it's gone (from the blind v3 misses, as a kind of wording, not those sentences)
CLASSIFIER_VERSION = "rules-9"


def _git(*args: str) -> str:
    out = subprocess.run(["git", *args], cwd=HERE, capture_output=True, text=True, timeout=2)
    return out.stdout.strip()


def policy_version() -> str:
    """The git commit Oscar is running from, plus "-changed" if oscar/ has uncommitted edits.

    Worked out each time it's asked (once per check for new email), so a fix that
    isn't committed yet, or a commit made while the API is running, isn't mixed up
    with the version before it.
    """
    try:
        commit = _git("rev-parse", "--short", "HEAD") or "unknown"
        changed = bool(_git("status", "--porcelain", "--", str(HERE)))
        return f"{commit}-changed" if changed else commit
    except (OSError, subprocess.SubprocessError):
        return "unknown"
