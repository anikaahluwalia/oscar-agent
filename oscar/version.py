"""Which version of Oscar made a decision, so real-inbox results can be compared across fixes."""

import subprocess
from functools import lru_cache
from pathlib import Path


@lru_cache
def policy_version() -> str:
    """The git commit Oscar is running from, or "unknown" outside a git checkout."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            timeout=2,
        )
        return out.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"
