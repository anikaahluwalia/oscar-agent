"""Run eval cases through the real Oscar and keep every result.

Each case goes through oscar.agent.decide(), the same function the app uses, with
the learned preferences frozen: nothing is learned while scoring. The run records
the versions, the dataset's hash and every case's result, so any number in a
report can be traced back to the cases behind it.
"""

import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from evals.regressions import load as load_regression_cases
from evals.schema import CaseResult, EvalCase, RunResult
from evals.scoring import E, breakdowns, calibration, confusion, judge, metrics
from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel, Email
from oscar.preferences import DEFAULT_POLICY, Policy, Preferences
from oscar.understand import PROMPT_VERSION, Reader, cache_key, model_name
from oscar.version import CLASSIFIER_VERSION, policy_version

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases"
RUNS = HERE / "results" / "runs"
MODEL_CACHE = HERE / "cache" / "understanding.jsonl"  # synthetic emails only, so it's committed
SAFETY_SOURCES = {"safety_check", "floor", "model_check"}


def load(path: Path) -> list[EvalCase]:
    return [EvalCase.model_validate_json(line) for line in path.read_text().splitlines() if line.strip()]


def dataset_info(path: Path, cases: list[EvalCase]) -> dict:
    return {"name": path.stem, "cases": len(cases), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()[:16]}


def regression_suite(with_model: bool = False) -> list[EvalCase]:
    """The regression cases from real-inbox mistakes, as eval cases. with_model: the run has the
    model reading emails, so a case's with_model answer is used where it has one."""
    out = []
    for c in load_regression_cases():
        expect = c.with_model if with_model and c.with_model else c.expect
        level = expect.level
        out.append(EvalCase(
            id=f"regression-{c.id}", suite="regression", category="regression", severity="high" if level == E else "low",
            email=c.email, expected_type="unspecified", expected_action=expect.action, expected_level=level,
            safety_floor_should_trigger=level == E, rationale=c.why, source="from_real_review", settings=c.settings,
        ))
    return out


def _setup_events(case: EvalCase) -> list[FeedbackEvent]:
    """The case's own "the user already taught Oscar this" feedback."""
    return [
        FeedbackEvent(decision_id=f"setup-{case.id}-{i}", kind=FeedbackKind(p.kind), action=p.action,
                      autonomy_level=AutonomyLevel.ASK_FIRST, sender=p.sender)
        for p in case.preferences for i in range(p.times)
    ]


def case_email(case: EvalCase) -> Email:
    return Email(id=case.id, sender=case.email.sender, to=case.email.to, subject=case.email.subject,
                 body="\n\n".join([*case.thread, case.email.body]), category=case.email.category, bulk=case.email.bulk)


class ModelSetup:
    """How the model is used in a run: who reads the emails, and whether its reading comes first."""

    def __init__(self, reader: Reader, first: bool = False) -> None:
        self.reader, self.first = reader, first

    def describe(self) -> dict:
        return {"model": model_name(), "prompt": PROMPT_VERSION, "mode": "first" if self.first else "fill"}


def read_all(cases: list[EvalCase], model: ModelSetup, workers: int = 6) -> None:
    """Read every case with the model up front, a few at a time, so scoring uses the saved answers."""
    from concurrent.futures import ThreadPoolExecutor
    # Each email it hasn't read before takes a call, so the first run after the prompt changes takes
    # minutes. Say how far it's got, so it doesn't look stuck.
    emails = [case_email(c) for c in cases]
    new = [e for e in emails if cache_key(e, model.reader.reads) not in model.reader.cache]
    if new:
        print(f"Reading {len(new)} emails with the model…", file=sys.stderr, flush=True)
    with ThreadPoolExecutor(workers) as pool:
        for done, _ in enumerate(pool.map(model.reader.read, new), 1):
            if done % 25 == 0 or done == len(new):
                print(f"  {done} of {len(new)}", file=sys.stderr, flush=True)


def run_case(case: EvalCase, learned: list[FeedbackEvent], policy: Policy, model: ModelSetup | None = None) -> CaseResult:
    preferences = Preferences.from_feedback(learned + _setup_events(case), policy)
    email = case_email(case)
    understanding = model.reader.read(email) if model else None
    start = time.perf_counter()
    bulk_action = Action(case.settings["bulk_action"]) if case.settings.get("bulk_action") else None
    decision = decide(email, preferences, bulk_action=bulk_action, understanding=understanding,
                      model_first=bool(model and model.first))
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
              learning_info: dict | None, policy: Policy = DEFAULT_POLICY, model: ModelSetup | None = None) -> RunResult:
    if model:
        read_all(cases, model)
    results = [run_case(c, learned or [], policy, model) for c in cases]
    table, _ = calibration(results)
    condition = "after" if learned else ("none" if suite == "regression" else "before")
    commit = policy_version()
    return RunResult(
        run_id=f"{dataset.get('name', suite)}-{condition}-{policy.name}{'-model-' + model.describe()['mode'] if model else ''}-{commit}",
        created_at=datetime.now(timezone.utc),
        suite=suite,
        dataset=dataset,
        versions={"commit": commit, "classifier": CLASSIFIER_VERSION, "policy": policy.describe(),
                  "understanding": model.describe() if model else None},
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
