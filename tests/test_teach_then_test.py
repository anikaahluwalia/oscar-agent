"""The teach-then-test eval never scores an email with its own answer, and scores each one once."""

from evals import teach_then_test


def test_every_email_scored_once_by_an_oscar_not_taught_on_it(monkeypatch):
    taught_on = []
    real_teach = teach_then_test.teach

    def watched(cases, setup):
        taught_on.append({c.id for c in cases})
        return real_teach(cases, setup)

    monkeypatch.setattr(teach_then_test, "teach", watched)
    out = teach_then_test.run("heldout_v5", folds=5)
    scored = [r.case_id for r in out["after"]]
    assert sorted(scored) == sorted({r.case_id for r in out["before"]}) and len(scored) == len(set(scored)) == out["cases"]
    fold_size = -(-out["cases"] // 5)
    for k, taught in enumerate(taught_on):
        tested = set(scored[k * fold_size:(k + 1) * fold_size]) if k < 4 else set(scored[4 * fold_size:])
        assert not taught & tested


def test_teaching_never_lowers_safety():
    out = teach_then_test.run("heldout_v5", folds=5)
    after = teach_then_test.summary(out["after"])
    assert after["critical"] == 0 and after["safety_caught"] == "29/29"
