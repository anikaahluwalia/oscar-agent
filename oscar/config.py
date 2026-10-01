"""Settings from the environment, and from a .env file in the repo root if there is one.

The .env file is for things that must never be committed, like the Google client
secret. Values already in the environment win over the file.
"""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()


def setting(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


# Where the API and the web app live. Google sends people back to the API after
# they connect Gmail, and the API sends them on to the web app.
API_URL = setting("OSCAR_API_URL", "http://localhost:8000").rstrip("/")
WEB_URL = setting("OSCAR_WEB_URL", "http://localhost:3000").rstrip("/")
