"""The learning set: the only data Oscar is allowed to learn from in an eval run.

A synthetic inbox (evals/dataset.py) goes through Oscar with a simulated user
(evals/user.py) giving feedback, exactly like evals/run.py. What comes out is the
feedback, which becomes Oscar's learned preferences. Held-out, safety and
regression cases are never part of it: they're scored with those preferences frozen.
"""

import re

from evals.dataset import KINDS, EvalEmail, generate
from evals.schema import EvalCase
from evals.user import SimulatedUser
from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackEvent, record_feedback
from oscar.history import History
from oscar.preferences import DEFAULT_POLICY, Policy, Preferences


def learn(n: int = 400, seed: int = 1, policy: Policy = DEFAULT_POLICY, model=None) -> tuple[list[FeedbackEvent], list[EvalEmail]]:
    """Run the learning inbox and return the feedback the simulated user gave, and the emails.
    With a model (evals.harness.ModelSetup), Oscar reads the learning emails with it too, so
    the user teaches the same Oscar that's scored."""
    history = History()
    user = SimulatedUser(seed=seed)
    stream = generate(n, seed)
    if model:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(6) as pool:
            list(pool.map(lambda item: model.reader.read(item.email), stream))
    for item in stream:
        understanding = model.reader.read(item.email) if model else None
        decision = decide(item.email, Preferences.from_feedback(history.feedback, policy),
                          understanding=understanding, model_first=bool(model and model.first))
        history.add_decision(decision)
        for kind in user.react(decision, item.truth):
            try:
                record_feedback(history, decision.id, kind)
            except FeedbackError:
                pass
    return list(history.feedback), stream


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z']+", text.lower()))


def overlap(a: str, b: str) -> float:
    """Share of words two texts have in common (Jaccard)."""
    wa, wb = _words(a), _words(b)
    return len(wa & wb) / len(wa | wb) if wa | wb else 0.0


SIMILAR = 0.8  # bodies sharing this many words count as the same email


def leaks(cases: list[EvalCase], stream: list[EvalEmail]) -> list[str]:
    """Ways eval cases overlap the learning set. Empty means no leakage. Checked before every run.

    - a template id used by both
    - the same sender, subject and body
    - a body that's nearly the same as one of the learning templates
    """
    problems = []
    learning_templates = {item.template for item in stream} | {f"{k.name}-{i}" for k in KINDS for i in range(len(k.templates))}
    seen = {(i.email.sender, i.email.subject, i.email.body) for i in stream}
    template_bodies = [body for k in KINDS for _, body in k.templates]
    for case in cases:
        if case.template_id and case.template_id in learning_templates:
            problems.append(f"{case.id}: shares template {case.template_id} with the learning set")
        if (case.email.sender, case.email.subject, case.email.body) in seen:
            problems.append(f"{case.id}: identical to an email in the learning set")
        for body in template_bodies:
            if overlap(case.email.body, re.sub(r"\{\w+\}", "", body)) >= SIMILAR:
                problems.append(f"{case.id}: nearly the same wording as a learning template")
                break
    return problems
