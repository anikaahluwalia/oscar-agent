from evals.dataset import ASK, ESCALATE, KINDS, generate
from oscar.safety import ACTION_FLOORS, LEVEL_ORDER


def test_same_seed_gives_same_stream():
    assert generate(50, seed=1) == generate(50, seed=1)


def test_different_seeds_give_different_streams():
    assert generate(50, seed=1) != generate(50, seed=2)


def test_every_kind_shows_up_in_a_long_stream():
    kinds = {e.truth.kind for e in generate(2000, seed=1)}
    assert kinds == {k.name for k in KINDS}


def test_risky_kinds_want_escalation():
    assert all(k.wanted == ESCALATE for k in KINDS if k.risky)


def test_what_the_user_wants_respects_the_floor():
    # The user never wants less than the floor allows, or the evals would punish Oscar for being safe.
    for k in KINDS:
        if k.ideal_action in ACTION_FLOORS:
            floor = ACTION_FLOORS[k.ideal_action][0]
            assert LEVEL_ORDER.index(k.wanted) >= LEVEL_ORDER.index(floor), k.name


def test_leave_it_for_me_kinds_are_not_autonomous():
    assert all(k.wanted in (ASK, ESCALATE) for k in KINDS if k.ideal_action is None)
