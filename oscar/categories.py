"""Your own categories for senders: Shopping, School, Family, anything you like.

These are for you to sort and browse by. They're not the kind of email Oscar reads it as
(oscar/classification.py), and Oscar's decisions never look at them: putting a sender in "Shopping"
doesn't change what he does with their email, and it can't get around a safety rule.

A sender is in at most one category, by address, so "Shop <hi@x.com>" and "hi@x.com" are the same.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from oscar.models import new_id, now

if TYPE_CHECKING:
    from oscar.history import History

MAX_NAME = 40
MAX_CATEGORIES = 50


class Category(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    created_at: datetime = Field(default_factory=now)


class CategoryError(ValueError):
    pass


def address_of(sender: str) -> str:
    """The sender's address, lowercased: "Shop <Hi@X.com>" -> "hi@x.com"."""
    return sender.split("<")[-1].rstrip(">").strip().lower()


def _clean(name: str) -> str:
    cleaned = " ".join(name.split())
    if not cleaned:
        raise CategoryError("Give the category a name.")
    if len(cleaned) > MAX_NAME:
        raise CategoryError(f"Keep the name to {MAX_NAME} characters or fewer.")
    return cleaned


def _taken(history: History, name: str, but: str | None = None) -> bool:
    return any(c.name.lower() == name.lower() and c.id != but for c in history.categories)


def _find(history: History, category_id: str) -> Category:
    found = next((c for c in history.categories if c.id == category_id), None)
    if found is None:
        raise CategoryError("I can't find that category.")
    return found


def create(history: History, name: str) -> Category:
    name = _clean(name)
    if _taken(history, name):
        raise CategoryError(f"You already have a category called {name}.")
    if len(history.categories) >= MAX_CATEGORIES:
        raise CategoryError(f"That's {MAX_CATEGORIES} categories already. Remove one first.")
    category = Category(name=name)
    history.categories.append(category)
    history.save_categories()
    return category


def rename(history: History, category_id: str, name: str) -> Category:
    category = _find(history, category_id)
    name = _clean(name)
    if _taken(history, name, but=category_id):
        raise CategoryError(f"You already have a category called {name}.")
    category.name = name
    history.save_categories()
    return category


def delete(history: History, category_id: str) -> None:
    """Remove a category. Its senders go back to having none; nothing else changes."""
    _find(history, category_id)
    history.categories = [c for c in history.categories if c.id != category_id]
    history.sender_categories = {s: c for s, c in history.sender_categories.items() if c != category_id}
    history.save_categories()


def assign(history: History, sender: str, category_id: str | None) -> None:
    """Put a sender in a category, or (None) take them out of theirs."""
    address = address_of(sender)
    if not address:
        raise CategoryError("Say which sender.")
    if category_id is None:
        history.sender_categories.pop(address, None)
    else:
        _find(history, category_id)
        history.sender_categories[address] = category_id
    history.save_categories()


def listing(history: History) -> list[dict]:
    """Every category, in the order you made them, with the senders in it."""
    return [{**c.model_dump(mode="json"), "senders": sorted(s for s, cid in history.sender_categories.items() if cid == c.id)}
            for c in history.categories]
