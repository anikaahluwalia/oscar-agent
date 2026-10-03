"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import { notesOverclaim, outcomeOf, understoodBy, labelName, when } from "@/components/activity/outcome";
import { DecisionActions } from "@/components/activity/decision-actions";
import { TechnicalDetails } from "@/components/activity/technical-details";
import { EmailBody } from "@/components/email-body";
import { EmailLink } from "@/components/email-link";
import { Highlight } from "@/components/highlight";
import { Checklist } from "@/components/kit/checklist";
import { answerLine } from "@/components/preference-card";
import { SenderAvatar } from "@/components/review/sender-avatar";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { safetyChecks, whatItIs } from "@/lib/insights";
import { ACTIONS, FEEDBACK, LEVEL_SOURCES, REPLIES, REVIEW_LABELS, STATUS, wouldOnly } from "@/lib/labels";
import { gmailLink, previewOf } from "@/lib/text";
import { answersFor, type OscarData } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Props = {
  item: DecisionWithFeedback;
  data: OscarData;
  onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean>;
  /** Set when this is an earlier decision and Oscar has decided on the email again since. */
  latestId?: string;
};

/**
 * The start of a demo email, with what Oscar noticed marked. The demo only keeps the
 * start of each email.
 */
function EmailPreview({ decision }: { decision: DecisionWithFeedback["decision"] }) {
  const preview = previewOf(decision);
  const noticed = decision.noticed;
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      {preview ? (
        <p className="text-sm leading-relaxed">
          <Highlight text={preview} phrase={noticed} className="bg-status-needs/15" />
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No preview. This email is mostly images or links.</p>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

const TONE = {
  done: "border-status-handled",
  undone: "border-border",
  waiting: "border-status-needs",
  stopped: "border-status-blocked",
  nothing: "border-border",
} as const;

/** One of Oscar's decisions, laid out for checking: the email, what he made of it, and what came of it. */
export function EmailDetail({ item, data, onFeedback, latestId }: Props) {
  const { decision: d, feedback, review } = item;
  const [showEmail, setShowEmail] = useState(false);
  const real = d.source === "gmail";
  const would = wouldOnly(d);
  const kind = whatItIs(d);
  const learned = data.learned.find((r) => r.sender === d.sender && r.action === d.action);
  const answers = answersFor(data.all, d.sender, d.action);
  const anyAnswers = answers.approved + answers.declined + answers.undone > 0;
  const outcome = outcomeOf(item);
  const link = gmailLink(d);
  const arrived = d.gmail?.received_at;

  return (
    <article className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card sm:p-6" aria-labelledby="decision-title">
      <header>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="decision-title" className="text-lg font-semibold">
            {would ? "What Oscar would do" : "Oscar's decision"}
          </h2>
          <p className="text-xs text-muted-foreground">Decided {when(d.created_at)}</p>
        </div>
      </header>

      {latestId && (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
          This is an earlier decision. Oscar read this email again later.{" "}
          <EmailLink id={latestId} className="font-medium text-primary underline-offset-4 hover:underline">
            See his latest
          </EmailLink>
        </p>
      )}

      <Part title="Email">
        <div className="flex items-center gap-3">
          <SenderAvatar sender={d.sender} size={36} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{d.sender}</p>
            <p className="truncate">{d.subject}</p>
          </div>
        </div>
        {arrived && <p className="text-xs">Arrived {when(arrived)}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" className="min-h-11 sm:min-h-9" aria-expanded={showEmail} onClick={() => setShowEmail((s) => !s)}>
            <ChevronDownIcon aria-hidden className={cn("transition-transform", showEmail && "rotate-180")} />
            {showEmail ? "Hide the email" : real ? "Show the whole email" : "Show the email"}
          </Button>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-1.5 px-2 text-sm underline-offset-4 hover:text-foreground hover:underline sm:min-h-9"
            >
              Open in Gmail <ExternalLinkIcon aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
        {showEmail && (real ? <EmailBody decisionId={d.id} /> : <EmailPreview decision={d} />)}
      </Part>

      <Part title="What it is">
        <p className="text-foreground">{kind ?? "He couldn't tell what kind of email this is."}</p>
        <p>{understoodBy(d)}.</p>
        {d.noticed && (
          <p>
            He noticed <mark className="rounded-sm bg-status-needs/15 px-0.5 text-foreground">&ldquo;{d.noticed}&rdquo;</mark>
          </p>
        )}
      </Part>

      <Part title={would ? "What he would do" : "Proposed action"}>
        <p className="text-foreground">
          {ACTIONS[d.action]}
          {d.action === "APPLY_LABEL" && real && <> &rarr; &ldquo;{labelName(d)}&rdquo;</>}
        </p>
        {REPLIES.has(d.action) && <p>He doesn&apos;t write or send replies. Replying is up to you.</p>}
      </Part>

      <Part title="Decision">
        <span className={cn("inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-sm font-medium", STATUS[d.autonomy_level].pill)}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {STATUS[d.autonomy_level].label}
        </span>
        <p>Why: {LEVEL_SOURCES[d.level_source]}.</p>
        {/* His note is written as he decides, before Gmail. When it says he did something that
            didn't happen (or a reply he never writes), leave it out: Outcome says what happened. */}
        {d.message && !notesOverclaim(d, item.done, feedback) && <p>&ldquo;{d.message}&rdquo;</p>}
      </Part>

      <Part title="What he's learned about this sender">
        {learned || anyAnswers ? (
          <div className="flex flex-col gap-1 border-l-2 border-primary/40 pl-3">
            {learned?.always_ask ? (
              <p className="text-foreground">You told him to always ask about this.</p>
            ) : learned?.level ? (
              <p className="text-foreground">
                He now picks {STATUS[learned.level].label} for this, because {learned.reason.replace(/\bme\b/g, "him")}.
              </p>
            ) : learned ? (
              <p className="text-foreground">Not enough answers yet to change what he does.</p>
            ) : null}
            <p>
              Your answers on &ldquo;{ACTIONS[d.action]}&rdquo; from this sender: {answerLine(answers).toLowerCase()}.
            </p>
          </div>
        ) : (
          <p>Nothing yet for this sender and action. Your answers teach him.</p>
        )}
        <Link href="/memory" className="flex min-h-11 items-center self-start text-sm font-medium text-primary underline-offset-4 hover:underline sm:min-h-0">
          Everything he&apos;s learned
        </Link>
      </Part>

      <Part title="Safety checks">
        <Checklist items={safetyChecks(d)} />
      </Part>

      <Part title="Outcome">
        <p className={cn("border-l-2 pl-3 text-foreground", TONE[outcome.tone])}>{outcome.text}</p>
        {feedback.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {feedback.map((f) => (
              <li key={f.id}>
                You: {FEEDBACK[f.kind]}, {when(f.created_at)}
              </li>
            ))}
          </ul>
        )}
        {review && review.label !== "SKIP" && (
          <p>
            You graded it: {REVIEW_LABELS[review.label].label}, {when(review.reviewed_at)}
          </p>
        )}
      </Part>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">What you can do</h3>
        <DecisionActions item={item} onFeedback={onFeedback} />
      </section>

      <TechnicalDetails item={item} />
    </article>
  );
}
