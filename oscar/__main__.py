"""Demo: python -m oscar [email.json ...]  (defaults to every file in emails/)."""

import sys
from pathlib import Path

from oscar.agent import decide
from oscar.models import Email

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "emails"


def main(argv: list[str]) -> None:
    paths = [Path(p) for p in argv] or sorted(DEFAULT_DIR.glob("*.json"))
    for path in paths:
        email = Email.model_validate_json(path.read_text())
        decision = decide(email)
        print(f"── {email.id}")
        print(f"   From:    {email.sender}")
        print(f"   Subject: {email.subject}")
        print(f"   Oscar:   {decision.action.value} → {decision.autonomy_level.value}")
        print(f"            {decision.explanation}")
        print()


if __name__ == "__main__":
    main(sys.argv[1:])
