"""Run eval cases through the real Oscar and keep every result.

Each case goes through oscar.agent.decide(), the same function the app uses, with
the learned preferences frozen: nothing is learned while scoring. The run records
the versions, the dataset's hash and every case's result, so any number in a
report can be traced back to the cases behind it.
"""

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from evals.regressions import load as load_regression_cases
from evals.schema import CaseResult, EvalCase, RunResult
from evals.scoring import E, breakdowns, calibration, confusion, judge, metrics
from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import AutonomyLevel, Email
from oscar.preferences import DEFAULT_POLICY, Policy, Preferences
from oscar.version import CLASSIFIER_VERSION, policy_version

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases"
RUNS = HERE / "results" / "runs"
SAFETY_SOURCES = {"safety_check", "floor"}


def load(path: Path) -> list[EvalCase]:
    return [EvalCase.model_validate_json(line) for line in path.read_text().splitlines() if line.strip()]


def dataset_info(path: Path, cases: list[EvalCase]) -> dict:
    return {"name": path.stem, "cases": len(cases), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()[:16]}


def regression_suite() -> list[EvalCase]:
    """The regression cases from real-inbox mistakes, as eval cases."""
    out = []
    for c in load_regression_cases():
        level = c.expect.level
        out.append(EvalCase(
            id=f"regression-{c.id}", suite="regression", category="regression", severity="high" if level == E else "low",
            email=c.email, expected_type="unspecified", expected_action=c.expect.action, expected_level=level,
            safety_floor_should_trigger=level == E, rationale=c.why, source="from_real_review",
        ))
    return out


def _setup_events(case: EvalCase) -> list[FeedbackEvent]:
    """The case's own "the user already taught Oscar this" feedback."""
    return [
        FeedbackEvent(decision_id=f"setup-{case.id}-{i}", kind=FeedbackKind(p.kind), action=p.action,
                      autonomy_level=AutonomyLevel.ASK_FIRST, sender=p.sender)
        for p in case.preferences for i in range(p.times)
    ]


def run_case(case: EvalCase, learned: list[FeedbackEvent], policy: Policy) -> CaseResult:
    preferences = Preferences.from_feedback(learned + _setup_events(case), policy)
    email = Email(id=case.id, sender=case.email.sender, to=case.email.to, subject=case.email.subject,
                  body="\n\n".join([*case.thread, case.email.body]), category=case.email.category, bulk=case.email.bulk)
    start = time.perf_counter()
    decision = decide(email, preferences)
    runtime = (time.perf_counter() - start) * 1000
    detected = decision.autonomy_level == E and decision.level_source in SAFETY_SOURCES
    passed, error, cost = judge(case, decision.autonomy_level, decision.action, detected)
    return CaseResult(
        case_id=case.id, category=case.category, severity=case.severity, sender_relationship=case.sender_relationship,
        expected_level=case.expected_level, predicted_level=decision.autonomy_level,
        expected_action=case.expected_action, predicted_action=decision.action,
        expected_type=case.expected_type, predicted_type=decision.email_type,
        safety_expected=case.safety_floor_should_trigger, safety_detected=detected,
        predicted_safety=decision.safety_flags, level_source=decision.level_source, confidence=decision.confidence,
        passed=passed, error=error, cost=cost, runtime_ms=round(runtime, 3),
    )


def run_suite(suite: str, cases: list[EvalCase], dataset: dict, learned: list[FeedbackEvent] | None,
              learning_info: dict | None, policy: Policy = DEFAULT_POLICY) -> RunResult:
    results = [run_case(c, learned or [], policy) for c in cases]
    table, _ = calibration(results)
    condition = "after" if learned else ("none" if suite == "regression" else "before")
    commit = policy_version()
    return RunResult(
        run_id=f"{suite}-{condition}-{policy.name}-{commit}",
        created_at=datetime.now(timezone.utc),
        suite=suite,
        dataset=dataset,
        versions={"commit": commit, "classifier": CLASSIFIER_VERSION, "policy": policy.describe()},
        learning=learning_info,
        metrics=metrics(results),
        breakdowns=breakdowns(results),
        confusion=confusion(results),
        calibration=table,
        cases=results,
    )


def save(run: RunResult, folder: Path = RUNS) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{run.run_id}.json"
    path.write_text(json.dumps(run.model_dump(mode="json"), indent=1) + "\n")
    return path
