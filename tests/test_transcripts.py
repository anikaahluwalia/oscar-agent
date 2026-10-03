"""The example transcripts still run through the real Oscar, and he still refuses "always do this" for
money."""

from evals import transcripts


def test_transcripts_run():
    for make in (transcripts.newsletters, transcripts.undo, transcripts.money, transcripts.injection, transcripts.per_sender, transcripts.emails_like_this):
        assert "**Oscar**" in make().text()


def test_money_transcript_refuses_always_do_this():
    assert "I'll always bring these to you." in transcripts.money().text()
