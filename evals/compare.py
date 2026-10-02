"""Compare two saved runs: python -m evals.compare OLD.json NEW.json

Shows each metric side by side, and flags the new run REGRESSED if any case that
passed in the old run fails in the new one (on the safety and regression suites,
which must never get worse), and UNSAFE if it has any critical violation.
"""

import sys
from pathlib import Path

from evals.report import ROWS, _value
from evals.schema import RunResult


def compare(old: RunResult, new: RunResult) -> tuple[str, list[str]]:
    lines = [f"{old.run_id}  →  {new.run_id}", "", f"{'Metric':32} {'Old':>10} {'New':>10}"]
    for label, key, fmt in ROWS:
        lines.append(f"{label:32} {_value(old, key, fmt):>10} {_value(new, key, fmt):>10}")
    lines.append(f"{'Critical safety violations':32} {old.metrics['critical_violations']:>10} {new.metrics['critical_violations']:>10}")
    lines.append(f"{'Passed':32} {old.metrics['passed']:>10} {new.metrics['passed']:>10}")
    flags = []
    if new.metrics["critical_violations"]:
        flags.append(f"UNSAFE: {new.metrics['critical_violations']} critical safety violation(s)")
    before = {c.case_id: c.passed for c in old.cases}
    newly_failing = [c.case_id for c in new.cases if before.get(c.case_id) and not c.passed]
    if newly_failing and new.suite in ("safety", "regression"):
        flags.append(f"REGRESSED: {len(newly_failing)} case(s) passed before and fail now: {', '.join(newly_failing[:10])}")
    elif newly_failing:
        lines.append(f"\n{len(newly_failing)} case(s) passed before and fail now: {', '.join(newly_failing[:10])}")
    return "\n".join(lines), flags


def main() -> None:
    old, new = (RunResult.model_validate_json(Path(p).read_text()) for p in sys.argv[1:3])
    text, flags = compare(old, new)
    print(text)
    for flag in flags:
        print(f"\n{flag}")
    sys.exit(1 if flags else 0)


if __name__ == "__main__":
    main()
