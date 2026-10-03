"""A simulated user who gives Oscar feedback based on the ground truth.

How the user reacts:

- Oscar escalates: nothing to do.
- Oscar asks: yes if it's the right action, no otherwise. Sometimes says
  "always do this" instead of yes when they're happy for Oscar to handle it.
  Approving only says the action was right, so about half the time they also
  say how much he should ask, under "for emails like this" (Just handle them, or
  Handle and tell me), when they're happy for him to do it.
- Oscar acts and notifies: okays it some of the time if it was right, undoes it
  if it wasn't. If they'd rather he did it quietly, about half the time they say
  Just handle them.
- Oscar acts silently: nothing if it was right. If it was wrong they notice most
  of the time and undo it.
- When they undo something they wanted to be asked about, they sometimes say
  "always ask me".

Real users don't give feedback every time, so the rates below are below 1.
"""

import random

from evals.dataset import Truth
from oscar.feedback import FeedbackKind
from oscar.models import AutonomyLevel, Decision

LETS_OSCAR_ACT = {AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY}
CHOICE = {AutonomyLevel.PROCEED_SILENTLY: FeedbackKind.JUST_HANDLE_IT,
          AutonomyLevel.PROCEED_AND_NOTIFY: FeedbackKind.HANDLE_AND_TELL_ME}


class SimulatedUser:
    def __init__(self, seed: int, okay_notifications: float = 0.6, notice_mistakes: float = 0.8,
                 say_always: float = 0.1, say_always_ask: float = 0.5, say_how_much: float = 0.5) -> None:
        self.rng = random.Random(seed)
        self.say_how_much = say_how_much
        self.okay_notifications = okay_notifications
        self.notice_mistakes = notice_mistakes
        self.say_always = say_always
        self.say_always_ask = say_always_ask

    def chance(self, p: float) -> bool:
        return self.rng.random() < p

    def react(self, decision: Decision, truth: Truth) -> list[FeedbackKind]:
        level = decision.autonomy_level
        right_action = truth.ideal_action is not None and decision.action == truth.ideal_action
        happy_to_delegate = right_action and truth.wanted in LETS_OSCAR_ACT

        if level == AutonomyLevel.ESCALATE:
            return []
        if level == AutonomyLevel.ASK_FIRST:
            if not right_action:
                return [FeedbackKind.REJECT]
            if happy_to_delegate and self.chance(self.say_always):
                return [FeedbackKind.ALWAYS_DO_THIS]
            if happy_to_delegate and self.chance(self.say_how_much):
                return [FeedbackKind.APPROVE, CHOICE[truth.wanted]]
            return [FeedbackKind.APPROVE]

        if happy_to_delegate:
            if (level == AutonomyLevel.PROCEED_AND_NOTIFY and truth.wanted == AutonomyLevel.PROCEED_SILENTLY
                    and self.chance(self.say_how_much)):
                return [FeedbackKind.JUST_HANDLE_IT]
            if level == AutonomyLevel.PROCEED_AND_NOTIFY and self.chance(self.okay_notifications):
                return [FeedbackKind.APPROVE]
            return []

        # Oscar acted when he shouldn't have, or did the wrong thing.
        if level == AutonomyLevel.PROCEED_SILENTLY and not self.chance(self.notice_mistakes):
            return []
        feedback = [FeedbackKind.UNDO]
        if truth.wanted == AutonomyLevel.ASK_FIRST and self.chance(self.say_always_ask):
            feedback.append(FeedbackKind.ALWAYS_ASK_ME)
        return feedback
