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
CLASSIFIER_VERSION = "rules-6"


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
