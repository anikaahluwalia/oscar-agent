"""How Oscar shows up for you: the companion in Gmail and which heads-ups he gives there.

Kept in one small file in the data folder, apart from any inbox, so the web app and the Gmail
extension read the same choices. None of it changes what Oscar decides: only what he shows you.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, ValidationError


class Companion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    show: bool = True  # Oscar in the corner of Gmail
    position: Literal["right", "left"] = "right"  # where he starts; you can still drag him
    animate: bool = True


class Notify(BaseModel):
    """Which cards Oscar shows in Gmail. Labels on your emails are always there."""
    model_config = ConfigDict(extra="forbid")
    approvals: bool = True  # an email waits for your yes
    safety: bool = True  # a safety rule stopped an email
    handled: bool = False  # he did something on his own


class AppSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    companion: Companion = Companion()
    notify: Notify = Notify()


class AppSettingsError(ValueError):
    pass


def load(path: Path) -> AppSettings:
    """The saved choices, or the defaults. A file that doesn't read cleanly falls back to the defaults."""
    try:
        return AppSettings.model_validate(json.loads(path.read_text()))
    except (OSError, ValueError, ValidationError):
        return AppSettings()


def update(path: Path, changes: dict) -> AppSettings:
    """Apply some changes ({"notify": {"handled": true}}) to what's saved, check them, and save."""
    merged = load(path).model_dump()
    for group, values in changes.items():
        if group not in merged or not isinstance(values, dict):
            raise AppSettingsError(f"There's no setting called {group}.")
        merged[group].update(values)
    try:
        saved = AppSettings.model_validate(merged)
    except ValidationError as e:
        raise AppSettingsError("That isn't a setting I know.") from e
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(saved.model_dump_json())
    return saved
