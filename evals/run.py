"""Run Oscar over a synthetic inbox with a simulated user."""

from evals.dataset import generate
from evals.metrics import METRICS, Record, by_kind, compute
from evals.user import SimulatedUser
from oscar.agent import decide
from oscar.feedback import FeedbackError, record_feedback
from oscar.history import History
from oscar.preferences import Preferences


def run(n: int, seed: int, learning: bool) -> list[Record]:
    """With learning off, the user still reacts (so regret can be measured) but
    Oscar never sees the feedback."""
    history = History()
    user = SimulatedUser(seed=seed)
    records = []
    for item in generate(n, seed):
        preferences = Preferences.from_feedback(history.feedback) if learning else None
        decision = decide(item.email, preferences)
        history.add_decision(decision)
        feedback = user.react(decision, item.truth)
        if learning:
            for kind in feedback:
                try:
                    record_feedback(history, decision.id, kind)
                except FeedbackError:
                    pass
        records.append(Record(item=item, decision=decision, feedback=feedback))
    return records


def evaluate(n: int, seeds: list[int], tail: int) -> dict:
    """Metrics for baseline, learning (whole run) and learning (last `tail` emails)."""
    results = {"baseline": [], "learning": [], "learning_tail": []}
    kinds = {"baseline": [], "learning_tail": []}
    for seed in seeds:
        baseline = run(n, seed, learning=False)
        learning = run(n, seed, learning=True)
        results["baseline"].append(compute(baseline))
        results["learning"].append(compute(learning))
        results["learning_tail"].append(compute(learning[-tail:]))
        kinds["baseline"].extend(baseline)
        kinds["learning_tail"].extend(learning[-tail:])
    summary = {name: {m: average([r[m] for r in runs]) for m in METRICS} for name, runs in results.items()}
    spread = {name: {m: spread_of([r[m] for r in runs]) for m in METRICS} for name, runs in results.items()}
    return {"summary": summary, "spread": spread, "by_kind": {k: by_kind(v) for k, v in kinds.items()},
            "n": n, "seeds": seeds, "tail": tail}


def average(values: list[float | None]) -> float | None:
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def spread_of(values: list[float | None]) -> tuple[float, float] | None:
    values = [v for v in values if v is not None]
    return (min(values), max(values)) if values else None
