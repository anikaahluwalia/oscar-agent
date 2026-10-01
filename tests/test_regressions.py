import pytest

from evals.regressions import check, load

CASES = load()


def test_cases_have_their_twins():
    ids = {c.id for c in CASES}
    assert all(c.twin in ids for c in CASES if c.twin)


@pytest.mark.parametrize("case", CASES, ids=[c.id for c in CASES])
def test_regression_case(case):
    assert check(case) is None
