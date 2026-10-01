from evals import transcripts


def test_transcripts_run():
    for make in (transcripts.newsletters, transcripts.undo, transcripts.money, transcripts.injection, transcripts.favourite):
        assert "**Oscar**" in make().text()


def test_money_transcript_refuses_always_do_this():
    assert "I can't take that one on myself." in transcripts.money().text()
