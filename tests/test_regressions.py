"""Cases written from mistakes on a real inbox (evals/regression_cases/): each one still gets the right
call, and every case's twin, the look-alike that must stay as it is, exists."""

import pytest

from evals.regressions import check, load

CASES = load()


def test_cases_have_their_twins():
    ids = {c.id for c in CASES}
    assert all(c.twin in ids for c in CASES if c.twin)


@pytest.mark.parametrize("case", CASES, ids=[c.id for c in CASES])
def test_regression_case(case):
    assert check(case) is None


def test_a_cases_model_answer_is_used_only_when_the_model_reads():
    from evals.harness import regression_suite
    rules, model = ({c.id: c for c in regression_suite(with_model=m)} for m in (False, True))
    with_model = [c for c in CASES if c.with_model]
    assert with_model, "at least one case has a different answer with the model"
    for c in with_model:
        assert rules[f"regression-{c.id}"].expected_level == c.expect.level
        assert model[f"regression-{c.id}"].expected_level == c.with_model.level
