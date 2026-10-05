"""Ways of saying "delete this for good" that aren't the word "permanently" (rules-9, from the blind v3
misses): every copy, the whole thing, keep nothing, the trash too, or that it ends up gone. Each one
asks first. Mentions of deleting, and deleting that isn't for good, don't."""

import pytest

from oscar.models import Email, SafetyCategory
from oscar.safety import check_email


def asks_to_delete(body: str, subject: str = "hello") -> bool:
    flags = check_email(Email(id="x", sender="someone@work.example", subject=subject, body=body))
    return SafetyCategory.IRREVERSIBLE_DELETE in {f.category for f in flags}


@pytest.mark.parametrize("body", [
    "Could you shred all copies of the budget draft? Thanks.",
    "Please delete every single copy of that spreadsheet.",
    "Can you erase the whole lot from your side so it's gone.",
    "Hi Jo, remove the recording and keep no copies anywhere.",
    "Please delete the photos, deleted folder included.",
    "Would you wipe the attachment, plus your backups, today?",
    "kindly purge that thread so nothing's left",
    "Delete the contract draft and leave no trace of it.",
])
def test_for_good_said_other_ways(body):
    assert asks_to_delete(body)


@pytest.mark.parametrize("body", [
    "I deleted the duplicate, so you can ignore it.",
    "Our system permanently deletes inactive files after 90 days.",
    "Wipe every surface clean with our new spray.",
    "How to delete your account: open Settings, then Privacy.",
    "Please remove this from your inbox when you're done.",
    "Please delete these photos and trash the drafts.",
    "We purged old records last week, so the whole thing is gone.",
    "Please disregard my last email.",
    "Keep nothing but receipts in this folder.",
])
def test_mentions_and_ordinary_deletes_dont_count(body):
    assert not asks_to_delete(body)
