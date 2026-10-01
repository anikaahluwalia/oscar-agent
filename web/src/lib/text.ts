// Tidying email text for display. Decisions keep the text exactly as Oscar read it;
// this only changes what's shown, so emails read before a fix still look right.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "", zwj: "", shy: "" };
// Invisible characters marketing emails use as padding (same list as oscar/gmail.py).
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤ㅤ﻿]/g;

export function cleanText(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}
