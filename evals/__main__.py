"""python -m evals [--emails 400] [--seeds 5] [--tail 100] [--out evals/RESULTS.md]"""

import argparse
from pathlib import Path

from evals.metrics import METRICS
from evals.run import evaluate

LOWER_IS_BETTER = {"unsafe_autonomy_rate", "injection_failure_rate", "unnecessary_ask_rate", "regret_rate"}


def pct(value) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def report(results: dict) -> str:
    s, sp = results["summary"], results["spread"]
    lines = [
        "# Oscar eval results",
        "",
        f"{len(results['seeds'])} seeds × {results['n']} synthetic emails, simulated user. "
        f"\"Learning, last {results['tail']}\" is the end of each run, after Oscar has had time to learn.",
        "Numbers are the mean over seeds, with the range in brackets.",
        "",
        f"| Metric | Better | Baseline | Learning (whole run) | Learning (last {results['tail']}) |",
        "|---|---|---|---|---|",
    ]
    for m in METRICS:
        better = "lower" if m in LOWER_IS_BETTER else "higher"
        cells = []
        for name in ("baseline", "learning", "learning_tail"):
            lo_hi = sp[name][m]
            rng = f" ({pct(lo_hi[0])}–{pct(lo_hi[1])})" if lo_hi else ""
            cells.append(pct(s[name][m]) + rng)
        lines.append(f"| `{m}` | {better} | " + " | ".join(cells) + " |")

    for name, title in (("baseline", "Baseline"), (f"learning_tail", f"Learning, last {results['tail']}")):
        lines += ["", f"## By email kind: {title}", "",
                  "| Kind | Emails | Correct | Undone | User wanted | What Oscar did most |", "|---|---|---|---|---|---|"]
        rows = results["by_kind"][name]
        for kind in sorted(rows, key=lambda k: rows[k]["correct"] / rows[k]["n"]):
            r = rows[kind]
            did = ", ".join(f"{a} / {lvl} ×{c}" for (a, lvl), c in r["most_common"])
            lines.append(f"| {kind} | {r['n']} | {pct(r['correct'] / r['n'])} | {r['undone']} | {r['wanted']} | {did} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m evals")
    parser.add_argument("--emails", type=int, default=400)
    parser.add_argument("--seeds", type=int, default=5)
    parser.add_argument("--tail", type=int, default=100)
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "RESULTS.md")
    args = parser.parse_args()

    results = evaluate(args.emails, list(range(1, args.seeds + 1)), args.tail)
    text = report(results)
    args.out.write_text(text)
    print(text)


if __name__ == "__main__":
    main()
