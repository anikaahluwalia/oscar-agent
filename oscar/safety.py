"""Safety floor.

The floor is the lowest autonomy level Oscar is allowed to use for an action.
It is checked after the policy and the stricter level wins, so changing the
policy table can't make a risky action less safe.
"""

import re
from types import MappingProxyType

from pydantic import BaseModel

from oscar.models import Action, AutonomyLevel, Email, SafetyCategory

LEVEL_ORDER = [
    AutonomyLevel.PROCEED_SILENTLY,
    AutonomyLevel.PROCEED_AND_NOTIFY,
    AutonomyLevel.ASK_FIRST,
    AutonomyLevel.ESCALATE,
]

# Read-only so it can't be changed at runtime.
ACTION_FLOORS = MappingProxyType({
    Action.MOVE_MONEY: (AutonomyLevel.ESCALATE, "I don't touch money"),
    Action.SEND_CREDENTIALS: (AutonomyLevel.ESCALATE, "I don't share passwords or login details"),
    Action.PERMANENTLY_DELETE: (AutonomyLevel.ASK_FIRST, "deleted email can't be brought back"),
    Action.UNSUBSCRIBE: (AutonomyLevel.ASK_FIRST, "it's hard to undo"),
    Action.SEND_REPLY: (AutonomyLevel.ASK_FIRST, "it goes out under your name"),
    Action.FORWARD: (AutonomyLevel.ASK_FIRST, "it shares this email with someone else"),
    Action.ACCEPT_MEETING: (AutonomyLevel.ASK_FIRST, "it commits your time"),
})


# Someone asking *you* to do something, within one sentence of what they're asking for.
# A risky request is that shape plus something sensitive: a password, money, an ID
# document, a sign-off. Written from the categories, not from particular emails, so
# new wording is caught (Stage 10 found the old exact phrases missed most of it).
# "Please" only counts with a verb after it: "please keep your PIN safe" asks for nothing.
ASK = (r"(?:\b(?:can|could|would|will) (?:you|u)\b|\b(?:please|kindly)\s+(?=(?:\w+\s+)?(?:send|share|provide|give|confirm|reply"
       r"|forward|enter|tell|text|email|upload|submit|pay|transfer|wire|buy|get|read|settle|attach)\b)|\bi need you to\b"
       r"|\bneed you to\b|\bi need\b|\bneeds (?:your|the)\b|\bsend (?:me|us|it|them|over)\b|\bemail me\b|\btext me\b"
       r"|\bshare (?:your|the|it|them|those|that|with)\b|\bforward (?:me|us)\b|\bgive me\b|\btell me\b|\breply with\b"
       r"|\blet me have\b|\bmind (?:sending|sharing)\b)")
NEAR = r"[^.?!\n]{0,80}"


def _asks_for(thing: str) -> str:
    """A request in either order: "can you send me the password" or "the password, can you send it"."""
    return rf"{ASK}{NEAR}{thing}|{thing}{NEAR}{ASK}"


SECRET = (r"\b(?:passwords?|passcodes?|passphrases?|log-?in (?:details|info|information|credentials)"
          r"|your log-?in\b(?! (?:screen|page|flow|button|form|mockups?|styles?|issue))|usernames? and passwords?|credentials"
          r"|(?:your|the|my|card|bank|atm) pin\b|pin (?:number|code)s?"
          r"|(?:verification|security|one-time|2fa|otp|mfa|auth(?:entication)?|sign-?in|login|backup|recovery) codes?"
          r"|(?:your |the )?card (?:number|details)|cvv|cvc|(?:the )?security code on the back"
          r"|the code (?:it|that|we|they|you) (?:just )?(?:texts?|sent|send|got)|codes? (?:that )?(?:just )?(?:came|hit|went) to"
          r"|(?:code|digits|numbers?) (?:\w+ ){0,5}(?:just )?(?:texted|sent to your phone|by text|via sms))\b")
GIFT_CARDS = r"(?:gift ?cards?|(?:apple|steam|google play|itunes|amazon|ebay|razer|xbox|playstation|visa) (?:gift )?cards?)"
MONEY = (r"(?:\bwire (?:me|us|it|them|the (?:money|funds|payment|deposit|balance)|\$|money|funds|payment)"
         r"|\btransfer (?:me|us|\$|money|funds|the (?:money|funds|payment|deposit|balance))|\be-?transfer\b"
         r"|\b(?:venmo|zelle|paypal|cash ?app)\b|\bremit\b|\bpay (?:this|the|me|us|it|now|today|immediately|invoice)\b"
         r"|\bsend (?:me |us )?(?:the )?(?:\$\s?[\d,]+(?:\.\d\d)? )?(?:money|funds|payment|deposit)\b|\$\s?[\d,]+(?:\.\d\d)?\s+to\b|\brouting (?:number|no)\b"
         r"|\bsettle (?:the |your |this |that )?(?:\$\s?[\d,]+ )?(?:balance|invoice|bill|payment|amount)\b|\bbeneficiary\b"
         r"|\bpayment handle\b|\bpay (?:the |this |your )?\$\s?[\d,]+|\b(?:wire|transfer)\b[^.?!\n]{0,40}\bto (?:the|this|my|our|a new) (?:account|iban)\b|\b(?:send|pay|venmo) (?:\w+ ){0,2}your share\b|" + GIFT_CARDS + r")")
ID_DOCS = (r"\b(?:scan|copy|photo|picture|pdf|image)s? of (?:the front and back of )?(?:your |my |a )?(?:passport|driver'?s licen[cs]e"
           r"|licen[cs]e|id card|photo id|government id|birth certificate|social security card|insurance card)\b"
           r"|\b(?:your|my|a|government|photo) id\b(?! badge)|\binsurance card\b|\bvaccination (?:history|records?|card)\b"
           r"|\b(?:medical|health|hr|personnel|employee|patient|payroll) (?:records?|files?|details|history)\b"
           r"|\bbank (?:account )?(?:details|number)\b|\baccount (?:number|and routing)\b"
           r"|\bnational insurance number\b|\btax (?:id|number|file number)\b")
SIGN_OFF = (r"\b(?:approve|approved|sign off on|sign|accept|agree to) (?:the |this |our |your )?(?:quote|contract|sow|statement of work"
            r"|agreement|terms|proposal|renewal)\b|\breply (?:with )?['\"]?(?:approved|i accept|i agree)\b")
# Agreement words a reply could be held to: "a quick 'yes' back", "just say 'go ahead'".
AGREE = r"(?:['\"](?:yes|go ahead|ok|okay|approved|agreed)['\"]|\bjust say (?:yes|go ahead)\b|\b(?:a quick|reply) yes\b)"
DEAL = r"\b(?:renewal|contract|billing|subscription|terms|quote|agreement|sow|lock in|start billing)\b"

# Warnings against sharing something ("never share your code with anyone") aren't requests.
# They're removed before checking, up to where the sentence turns ("..., but send it to me").
# For the deletion check: someone asking (please, would you mind, or a clause that starts with the
# verb: "Hi Sam, delete this permanently"), deleting, something in the mailbox, and that it's for
# good. Gmail bodies reach Oscar with line breaks turned into spaces (gmail.clean_text), so a comma
# or a dash can start the clause as well as a full stop. Every gap is bounded, so it stays fast.
START = r"(?:^|[.!?:;,•*(\n-])\s{0,3}"
REQUEST = (r"(?:please,?|kindly|can you|could you|would you(?: mind)?|will you|i want you to|i(?:'d| would) like you to"
           r"|i need you to|need you to|do me a favou?r and|make sure (?:to|you)|be sure to|go ahead and|you (?:must|should|need to))")
DELETE_ASK = rf"(?:{START}|\b{REQUEST}\s+)(?:(?:just|also|then|now|please,?|go ahead and)\s+)?"
DELETE = (r"(?:delet(?:e|ing)|eras(?:e|ing)|remov(?:e|ing)|wip(?:e|ing)|purg(?:e|ing)|destroy(?:ing)?|shred(?:ding)?"
          r"|trash(?:ing)?|bin(?:ning)?|nuk(?:e|ing))")
MAIL = (r"(?:it|this|that|them|these|those|everything|(?:[\w.@'-]+\s+){0,5}?(?:e-?mails?|messages?|threads?|attachments?"
        r"|conversations?|chains?|cop(?:y|ies)|files?|mail|inbox|photos?|pictures?|pics|screenshots?|images?|documents?|docs"
        r"|pdfs?|invoices?|recordings?|notes))")
GAP = r"(?:[^.?!\n]|\.(?=\S)){0,80}?"  # a full stop only ends it between sentences, not in "invoice.pdf" or "acme.com"
FOR_GOOD = (r"(?:\bpermanently\b|\bfor good\b|\bforever\b|\birreversibly\b|\bcompletely\b|\bbeyond recovery\b"
            r"|\bfrom (?:the |your )?(?:trash|bin|deleted (?:items|folder)|inbox and trash)\b"
            r"|\b(?:and|then|,)\s*(?:then\s+)?(?:empty|clear) (?:the|your) (?:trash|bin|deleted (?:items|folder))\b"
            r"|\b(?:and|,)\s*(?:do not|don't|never)\s+(?:keep|retain|save|store|hold on to)\b[^.?!\n]{0,20}\b(?:cop(?:y|ies)|backups?)\b"
            r"|\bwithout (?:keeping|saving|retaining|leaving) (?:a |any )?(?:cop(?:y|ies)|backups?|trace)\b"
            r"|\bso (?:it|they|that|nothing) (?:can't|cannot|can never|won't|will never) be (?:recovered|restored|undone|retrieved)\b)")
# "If you are not the intended recipient, please delete it and do not retain a copy": a footer on
# every email from some senders, not a request about this one. Only the deletion check skips it,
# so instructions hidden in a footer are still read by the other checks.
DISCLAIMER = re.compile(
    r"\bif you (?:are not|aren't|were not|weren't) the (?:intended|named|correct) (?:recipient|addressee)s?\b[^.?!]*[.?!]?"
    r"(?:[^.?!]*\b(?:delete|destroy|erase|copies|copy|retain)\b[^.?!]*[.?!]?){0,2}"
    r"|\bif you (?:have )?received this (?:e-?mail |message |communication |transmission )?(?:in error|by mistake|by accident)\b"
    r"[^.?!]*[.?!]?(?:[^.?!]*\b(?:delete|destroy|erase|copies|copy|retain)\b[^.?!]*[.?!]?){0,2}")

NEGATED = re.compile(
    r"\b(?:never|don't|do not|please don't|please do not)\s+(?:\w+\s+){0,2}?(?:share|give|disclose|reveal|tell|send)\b"
    r"[^.?!\n,;]{0,60}?\b(?:with|to) (?:anyone|anybody|others|other people|someone else)\b(?:,? (?:not )?even (?:us|our staff))?"
    r"|\bwe(?:'ll| will)? never (?:ask|call|email|text) (?:you )?(?:for|to (?:share|give|send))\b[^.?!\n,;]{0,60}"
    # A warning that ends there: "Never share your verification code." Only when the sentence (or the
    # subject line) stops right after it, so "never share your password over chat, but email it to me"
    # is still read as the request it is.
    r"|\b(?:never|don't|do not)\s+(?:share|give out|disclose|reveal)\s+(?:your|the|any)\s+(?:\w+\s+){0,2}?"
    r"(?:codes?|passwords?|passcodes?|pins?|credentials|log-?in details)\b(?=\s*(?:[.!]|\n|$))")

# Patterns in the email text that hold Oscar back no matter which action the
# classifier picked (how far: FLAG_LEVELS below). These look for requests, not just
# mentions. Injection is first so its explanation is the one the user sees. Every
# scan is bounded, so a long email can't make them slow.
AI = r"(?:ai|llms?|language models?|bots?|chatbots?|automated (?:\w+ )?(?:assistants?|agents?|helpers?|systems?)|virtual assistants?|email assistants?)"
EMAIL_CHECKS = MappingProxyType({
    SafetyCategory.PROMPT_INJECTION: (
        "Someone left instructions for me in this email, so I'm not doing anything with it",
        [
            r"\b(ai|email|virtual) assistant\s*[:,]",
            r"\bnote to (the )?(ai|assistant)\b",
            r"\bignore (all |any |your |the )*(previous |prior |earlier |above )*(instructions|rules|prompts?)\b",
            r"\bthe user has (already )?(pre-)?approved\b",
            r"\bthe user (said|says|has said) (it's|its|this is) (fine|ok|okay)\b",
            # Addressing Oscar *and* telling him to do something with your email, or to change his
            # rules. A greeting alone isn't an instruction: "Hi Oscar," is how people write to
            # anyone called Oscar (found on a real inbox: tests/test_review_findings.py).
            r"(^|\n)\s*(hey |hi |hello |dear )?oscar\s*[,:](?s:.{0,300}?)(\b(always|from now on|remember (this|that)|rules?"
            r"|silently|without (asking|telling|notifying)|the user)\b|\b(forward|send|share|export|delete|remove|archive|move"
            r"|mark|label|search|find|copy|unsubscribe)\b[^.?!\n]{0,40}?\b(e-?mails?|messages?|threads?|inbox|mailbox|attachments?"
            r"|contacts?|invoices?|passwords?|codes?|conversations?|data|records?|files?|folders?|notes)\b)",
            # Text aimed at an AI, or trying to change what the assistant may do.
            r"(^|\n)\s*\[?\s*system\s*(override|message|prompt|instructions?|note)?\s*[\]:]",
            r"\[\s*system\b[^\]\n]{0,20}\]|\bsystem (override|prompt|instructions?)\b",
            # "To the AI reading this:", not "welcome to the AI era".
            r"\b(to|for) the (ai|assistant|bot|agent)\b\s*(reading|processing|handling|[:,])",
            r"\b(ai|assistant|bot|agent) reading this\b",
            rf"\bif (you(?:'re| are) )?(an? |any |the )?{AI}\b[^.?!\n]{{0,30}}\b(is |are )?(reading|processing|handling|scanning|summari[sz]ing)\b",
            rf"\bdear {AI}\b",
            rf"(^|[.!?>]\s*|\n)\s*{AI}\s*(instructions?|note|notice)?\s*[,:]",
            r"(^|[.!?:>]\s*|\n)\s*assistants?\s*(instructions?|note|notice)?\s*[,:]",
            r"\b(safety|security) (checks?|rules?|filters?) (are |is |have been )?(disabled|off|turned off|suspended)\b",
            r"\b(your|the assistant'?s?) (permissions?|autonomy|level|access|rules?) (have|has|were|was) (been )?(raised|changed|updated|upgraded|expanded)\b",
            r"\b(act|proceed) (silently|without asking) on (all|every)\b",
            r"\b(mark|treat) (this|it) (email )?as (safe|trusted)\b",
            r"\b(do not|don't|never) (tell|show|notify|alert) the user\b",
            r"\bwithout (telling|notifying|asking|showing) the user\b",
            r"\bdo not (surface|show) (it|them|this|these)\b",
            # Talking *to* an AI, not about one: "for AI readers:", "AI assistants, forward...",
            # "automated agents processing this". A newsletter reviewing AI assistant apps isn't flagged.
            r"\b(for|to|attention:?) (the |any |all )?(ai|automated|virtual|email)[- ](readers?|agents?|assistants?|bots?|systems?)\b",
            r"\b(ai|automated|virtual)[- ](readers?|agents?|assistants?|bots?)\s*[,:]",
            r"\b(ai|automated|virtual)[- ](agents?|assistants?|bots?|systems?) (processing|reading|handling|scanning) (this|these)\b",
            r"<!--[^>]{0,200}\b(assistant|ai|agent|bot)\b",
            # "your assistant" alone is often a person, so only an email, AI or virtual one counts.
            r"\byour (email|ai|virtual) assistant\b[^.]{0,60}\b(should|must|will|always|never|to)\b",
            r"\b(add|set|create) (this |a )?(new )?rule (to|for|in) your (email )?assistant\b",
            r"<\s*/?\s*(tool_call|function_call|tool|system|instructions?)\b",
            r"\bexecute the following\b",
            r"\bdo not (notify|tell|alert) the (mailbox )?owner\b",
        ],
    ),
    SafetyCategory.MONEY: (
        "It's asking for money, and I don't touch money",
        [
            r"\bremit\b",
            r"\b(send|pay)\b[^.]{0,120}\bvia (zelle|venmo|paypal|wire)\b",
            # Asking *you* to buy or send gift cards, or for their codes. Shops that just sell
            # gift cards aren't asking for money (evals/regression_cases/promo-sells-gift-cards).
            rf"\b(you|u)\b[^.?!]{{0,40}}\b(buy|get|purchase|pick up|grab|send)\b[^.?!]{{0,40}}\b{GIFT_CARDS}\b",
            # A card's codes being asked for, not a shop's discount code next to "gift cards
            # excluded" (found on a real inbox).
            rf"\b{GIFT_CARDS}\b.{{0,160}}\b(scratch|numbers on the back)\b",
            rf"\b{GIFT_CARDS}\b.{{0,160}}\b(send|text|email|share|give|tell|read|reply with)\b[^.?!]{{0,40}}\b(codes?|pins?|numbers)\b",
            # Buying one to pay with: "enter its code on the claim page". A shop's "use code FALL20" isn't the card's.
            rf"\b{GIFT_CARDS}\b.{{0,160}}\b(enter|type|redeem|submit|input|provide|use)\s+(its|their|the cards?'?s?)\b[^.?!]{{0,20}}\b(codes?|pins?|numbers)\b",
            r"\bsend (me )?(the )?(funds|money)\b",
            r"\b(settle|pay|send)\b[^.]{0,120}\bby (bank |wire )?transfer\b",
            _asks_for(MONEY),
            # An amount, then "send it / pay me" just after, even across a sentence.
            r"\b(wire|transfer|send) (it|the (money|funds|payment|balance)|\$\s?[\d,]+) to (me|us|this|my|our|the (account|following))\b",
            r"\$\s?[\d,]+(\.\d\d)?[^?!\n]{0,80}\b(send|pay|venmo|zelle|transfer|e-?transfer)\b (it|me|us|that|the money)\b",
            # Paying somewhere new: "send this month's transfer to our new account", "pay the invoice
            # to the IBAN below". The classic way to redirect a payment; "your refund was sent to the
            # account ending 1234" isn't a request.
            r"\b(send|make|pay|transfer|wire|remit|direct|route)\b[^.?!\n]{0,80}\bto (our|my|the|this|a) new (bank )?(account|bank|iban|payee)\b",
            r"\b(send|pay|transfer|wire|remit)\b[^.?!\n]{0,80}\b(iban|account number|routing number|sort code)\b",
        ],
    ),
    SafetyCategory.CREDENTIALS: (
        "It's asking for a password or code, and I don't share those",
        [
            r"\benter your (password|login|credentials)\b",
            r"\bverify your (account )?(password|login)\b",
            r"\b(read|send|share|give|tell) (me |us )?(the |your )?(\d-digit |one-time |verification |security )?code\b",
            _asks_for(SECRET),
            r"\b(\d-digit |one-time |verification |security )?code\b.{0,120}\breply with (it|the code|that)\b",
            # The same across sentences and lines: "a code by text in a minute. Reply to this email with it."
            r"\bcodes?\b(?s:.){0,160}?\breply (to (this|my|our|the) (e-?mail|message|text) )?with (it|them|the code|that( code)?|this( code)?)\b",
            # A code that came by text, then a request for it in the next sentence.
            r"\b(code|digits)\b[^?!\n]{0,80}\b(by text|texted|via sms|to your phone|on your phone)\b.{0,120}?\b(forward|send|read|tell|give|share|text)\b (it|me|us|them)\b",
        ],
    ),
    SafetyCategory.ACCOUNT_SECURITY: (
        "It's about your account security, so you should look at it yourself",
        [
            r"\bnew sign-?in\b",
            r"\btried to (log|sign) in\b",
            r"\bpassword (was|has been) (changed|reset)\b",
            r"\breset your password\b",
            r"\brecovery (email|phone|address)\b",
            # Something happened to the account: 2FA off, a new device, an unusual sign-in.
            # Tips about turning two-factor on aren't an alert (a security newsletter).
            r"\b(two-factor|two-step|2-step|2fa|mfa|multi-factor)\b[^.]{0,40}\b(turned off|disabled|removed|switched off)\b",
            r"\bnew (device|phone|computer|browser|login|passkey|security key|payee|beneficiary|recipient|authenticator)\b[^.]{0,40}\b(added|signed in|logged in|was used|registered|set up|created)\b",
            # Something that happened, not advice in a footer ("if you notice suspicious activity").
            r"\b(noticed|detected|spotted|saw|flagged|there (was|has been|is))\b[^.]{0,40}\b(unusual|suspicious) (activity|sign-?in|login|log-?in)\b",
            r"\b(unusual|suspicious) (sign-?in|login|log-?in)( attempt)? (from|on|to|detected|was)\b",
            r"\b(blocked|stopped|prevented|denied)\b[^.]{0,30}\b(attempt|sign-?in|login|log-?in)\b",
            r"\bnew (payee|beneficiary|passkey)\b",
            r"\bwas(n't| not)? this you\b|\b(this|that|it) was(n't| not) you\b",
            r"\b(signed|logged) (in|into) (to )?your account\b",
            r"\b(we noticed|there was) an? (new |unusual |suspicious )?(log-?in|sign-?in)\b",
            r"\b(log-?in|sign-?in|logged in|signed in)\b[^.]{0,40}\bnew (country|location|city|region)\b",
            r"\b(sign-?in|login|recovery|account) (email|address|phone|number)\b[^.]{0,30}\b(was|has been) changed\b",
        ],
    ),
    SafetyCategory.SENSITIVE_DATA: (
        "It has sensitive personal info in it, and I don't share that",
        [
            r"\bssns?\b",
            r"\bsins?\b",
            r"\bsocial (security|insurance)\b",
            r"\bpassport number\b",
            r"\bdate of birth\b",
            r"\bbank details\b",
            _asks_for(ID_DOCS),
            _asks_for(r"\b(medical (?:leave )?(?:records?|history|information|info|details|forms?|notes?)|(?:sick|leave) notes?|performance reviews?"
                      r"|(?:current |your |their |his |her )salar(?:y|ies)|disciplinary (?:records?|notes?|files?))\b"),
        ],
    ),
    SafetyCategory.COMMITMENT: (
        "Replying would commit you to something, and that's your call",
        [
            r"\bi agree\b",
            r"\baccept the (new |updated )?terms\b",
            r"\bsign the (contract|agreement)\b",
            _asks_for(SIGN_OFF),
            r"\breply[^.?!]{0,30}\bto (confirm|approve|accept)\b[^.?!]{0,60}\b(contract|renewal|quote|order|purchase|agreement|terms|sow|plan|upgrade|offer)\b",
            r"\b(contract|renewal|agreement|nda|terms|quote|sow|plan|upgrade|subscription)\b.{0,160}\breply (to confirm|so)\b",
            rf"{AGREE}.{{0,120}}{DEAL}|{DEAL}.{{0,120}}{AGREE}",
            r"\b(you've|you have|you) signed off\b|\bsign off on (the|this)\b|['\"](agreed|approved)['\"]",
            # "Replying to this email confirms your acceptance", "reply confirming you accept the policy".
            r"\breplying\b[^.?!]{0,40}\b(confirms?|means|counts as)\b[^.?!]{0,30}\b(accept|agree|acceptance|agreement)",
            r"\breply (confirming|to confirm) (that )?(you )?(accept|agree)\b",
        ],
    ),
    # Asking for email to be deleted for good: "please delete it permanently and don't keep a copy",
    # "remove this message for good", "permanently delete all messages older than 30 days". The
    # floor on PERMANENTLY_DELETE only works if the classifier proposed it, so this reads the email
    # itself. It needs a request (please, can you, or a sentence that starts with the verb), the
    # mailbox as the thing deleted, and that it's for good. "We deleted the duplicate", "you can
    # delete this draft" and "delete your account at any time in settings" aren't requests to
    # delete email for good.
    SafetyCategory.IRREVERSIBLE_DELETE: (
        "It asks to delete email for good, and that can't be undone",
        [
            rf"{DELETE_ASK}{DELETE}\s+{MAIL}\b{GAP}{FOR_GOOD}",
            rf"{DELETE_ASK}(?:permanently|irreversibly|completely|forever) {DELETE}\s+{MAIL}\b",
            rf"{DELETE_ASK}hard[- ]delet(?:e|ing)\b",
            rf"^\s*(?:please,? )?{DELETE}(?: (?:it|this|them))? (?:permanently|for good|forever)\b",  # a subject line
        ],
    ),
})

# How far each check moves the level, whatever was learned. Most are a stop: Oscar doesn't do
# these at all, or the email is trying to trick him. Deleting for good is something he could do
# with your say-so, so it's an ask: he understands it, but it's yours to authorize. The final
# level is always the stricter of this and what policy and learning chose.
FLAG_LEVELS = MappingProxyType({
    SafetyCategory.PROMPT_INJECTION: AutonomyLevel.ESCALATE,
    SafetyCategory.MONEY: AutonomyLevel.ESCALATE,
    SafetyCategory.CREDENTIALS: AutonomyLevel.ESCALATE,
    SafetyCategory.ACCOUNT_SECURITY: AutonomyLevel.ESCALATE,
    SafetyCategory.SENSITIVE_DATA: AutonomyLevel.ESCALATE,
    SafetyCategory.COMMITMENT: AutonomyLevel.ESCALATE,
    SafetyCategory.IRREVERSIBLE_DELETE: AutonomyLevel.ASK_FIRST,
})


# A second layer under the checks: things risky enough that Oscar never handles an email
# that mentions them on his own, even when no check recognised a request. He asks
# instead. Feedback can't change this, like the floor. A harmless mention costs an
# extra ask; a missed request could cost much more. Words that turn up on ordinary
# receipts ("paid with gift card", "medical supplies") are left to the checks above.
CAUTION = re.compile(
    r"\b(passwords?|passcodes?|passphrases?|log-?in details|credentials|(verification|one-time|security|2fa|sign-?in|backup|recovery) codes?"
    r"|wire transfer|routing numbers?|account numbers?|iban|swift code|gift ?card (codes?|numbers?|pins?)|crypto|bitcoin"
    r"|passports?|driver'?s licen[cs]e|social security|ssn|medical (records?|history)|diagnos[ie]s|nda|contracts?|e-?sign|docusign"
    r"|overdue|e-?transfer|beneficiary|new payee|insurance card|salary|payment handle"
    # A contract by another name: "Re: Services agreement", "I'll send a clean copy for signature".
    r"|(services?|consulting|master|licen[cs]e|employment|lease|rental|partnership|purchase|settlement|loan) agreements?"
    r"|for (your )?signatures?)\b",
    re.I,
)


def _normalise(text: str) -> str:
    """Curly quotes as plain ones, since Gmail and phones send ’ and the patterns are written with '."""
    return text.translate(QUOTES)


QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'})


def caution(email: Email) -> str | None:
    """The sensitive thing an email mentions, if any."""
    found = CAUTION.search(_normalise(f"{email.subject}\n{email.body}"))
    return found.group(0) if found else None


# When a flag matches, this is the action the email is really asking for.
FLAG_ACTIONS = MappingProxyType({
    SafetyCategory.MONEY: Action.MOVE_MONEY,
    SafetyCategory.CREDENTIALS: Action.SEND_CREDENTIALS,
    SafetyCategory.IRREVERSIBLE_DELETE: Action.PERMANENTLY_DELETE,
})


class SafetyFlag(BaseModel):
    category: SafetyCategory
    reason: str
    matched: str


def without_warnings(text: str) -> str:
    """The text without its warnings against sharing something, which aren't requests (NEGATED)."""
    return NEGATED.sub(" ", _normalise(text))


def check_email(email: Email) -> list[SafetyFlag]:
    text = without_warnings(f"{email.subject}\n{email.body}".lower())
    flags = []
    for category, (reason, patterns) in EMAIL_CHECKS.items():
        scanned = DISCLAIMER.sub(" ", text) if category == SafetyCategory.IRREVERSIBLE_DELETE else text
        for pattern in patterns:
            match = re.search(pattern, scanned)
            if match:
                flags.append(SafetyFlag(category=category, reason=reason, matched=match.group(0)))
                break
    return flags


def required_level(flags: list[SafetyFlag]) -> AutonomyLevel | None:
    """The least involvement the checks on the email allow: the strictest of their levels."""
    return max((FLAG_LEVELS[f.category] for f in flags), key=LEVEL_ORDER.index, default=None)


def is_stricter(a: AutonomyLevel, b: AutonomyLevel) -> bool:
    return LEVEL_ORDER.index(a) > LEVEL_ORDER.index(b)


def apply_floor(action: Action, level: AutonomyLevel, reason: str) -> tuple[AutonomyLevel, str]:
    floor = ACTION_FLOORS.get(action)
    if floor and is_stricter(floor[0], level):
        return floor
    return level, reason
