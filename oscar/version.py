"""Which version of Oscar made a decision, so real-inbox results can be compared across fixes."""

import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


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
