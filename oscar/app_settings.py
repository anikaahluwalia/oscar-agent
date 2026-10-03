"""How Oscar shows up for you: the companion in Gmail, which heads-ups he gives there, and
what his Gmail labels are called.

Kept in one small file in the data folder, apart from any inbox, so the web app, the Gmail
extension and the Gmail client all read the same choices. None of it changes what Oscar
decides: only what he shows you and what he calls things.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from oscar.labels import DEFAULT_NAMES, LabelNameError, check_names


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
    # What each of his Gmail labels is called, by role (oscar/labels.py). Changed with
    # rename_label below, so Gmail is renamed too, never through update().
    labels: dict[str, str] = Field(default_factory=lambda: dict(DEFAULT_NAMES))

    @field_validator("labels")
    @classmethod
    def _names(cls, names: dict[str, str]) -> dict[str, str]:
        return check_names(names)


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
        if group == "labels":
            raise AppSettingsError("Rename labels one at a time, so Gmail is renamed too.")
        if group not in merged or not isinstance(values, dict):
            raise AppSettingsError(f"There's no setting called {group}.")
        merged[group].update(values)
    try:
        saved = AppSettings.model_validate(merged)
    except ValidationError as e:
        raise AppSettingsError("That isn't a setting I know.") from e
    save(path, saved)
    return saved


def rename_label(path: Path, role: str, name: str) -> tuple[AppSettings, str]:
    """Check a new name for one of his labels. Returns the settings with it, not saved yet, and
    the old name, so the caller can rename the label in Gmail first and then save()."""
    current = load(path)
    if role not in current.labels:
        raise AppSettingsError(f"There's no label called {role}.")
    try:
        names = check_names({**current.labels, role: name})
    except LabelNameError as e:
        raise AppSettingsError(str(e)) from e
    return current.model_copy(update={"labels": names}), current.labels[role]


def save(path: Path, settings: AppSettings) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(settings.model_dump_json())
