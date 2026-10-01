"""Run the regression cases written from real-inbox mistakes (evals/regression_cases/).

    python -m evals.regressions
"""

import json
import sys
from pathlib import Path

from pydantic import BaseModel

from oscar.agent import decide
from oscar.models import Action, AutonomyLevel, Email

CASES = Path(__file__).resolve().parent / "regression_cases"


class Expect(BaseModel):
    level: AutonomyLevel
    action: Action | None = None


class Case(BaseModel):
    id: str
    added: str
    found_as: str  # the review label it came from, e.g. UNNECESSARY_FLAGGING
    why: str
    twin: str | None = None
    email: dict
    expect: Expect


def load() -> list[Case]:
    return [Case.model_validate(json.loads(p.read_text())) for p in sorted(CASES.glob("*.json"))]


def check(case: Case) -> str | None:
    """None if Oscar gets the case right, else what he did instead."""
    decision = decide(Email(id=case.id, **case.email))
    got = (decision.autonomy_level, decision.action)
    if decision.autonomy_level != case.expect.level or (case.expect.action and decision.action != case.expect.action):
        return f"{got[1].value} → {got[0].value}"
    return None


def main() -> int:
    cases = load()
    if not cases:
        print("No regression cases yet.")
        return 0
    failed = 0
    for case in cases:
        problem = check(case)
        failed += problem is not None
        print(f"{'FAIL' if problem else 'ok  '}  {case.id}" + (f"  (got {problem})" if problem else ""))
    print(f"\n{len(cases) - failed} of {len(cases)} pass")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
