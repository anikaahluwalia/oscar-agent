import { OscarMood, type OscarPose } from "@/components/oscar-mood";
import type { DecisionWithFeedback } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat-store";
import { EmailCard } from "./email-card";
import { RuleCard } from "./rule-card";

const BUBBLE = "flex min-w-0 flex-col gap-3 rounded-[22px] rounded-bl-md border bg-card px-[18px] py-3.5 text-base leading-normal";

/** Oscar on the left: his mood beside a white bubble. */
function FromOscar({ pose, children }: { pose: OscarPose; children: React.ReactNode }) {
  return (
    <div className="flex max-w-[600px] items-end gap-2.5">
      <OscarMood pose={pose} size={56} className="size-11 sm:size-14" />
      {children}
    </div>
  );
}

export function YourMessage({ text }: { text: string }) {
  return (
    <p className="max-w-[460px] self-end rounded-[22px] rounded-br-md bg-primary px-[18px] py-3 text-base leading-normal break-words whitespace-pre-line text-primary-foreground">
      {text}
    </p>
  );
}

export function OscarMessage({
  message,
  index,
  pose,
  items,
}: {
  message: ChatMessage;
  index: number;
  pose: OscarPose;
  items: DecisionWithFeedback[];
}) {
  // Emails he talks about, as cards. Ones that aren't in the inbox any more are left out.
  const emails = (message.decisions ?? [])
    .slice(0, 6)
    .map((id) => items.find((i) => i.decision.id === id))
    .filter((i): i is DecisionWithFeedback => !!i);
  return (
    <div className="flex flex-col gap-1.5">
      <FromOscar pose={pose}>
        <div className={BUBBLE}>
          <p className="break-words whitespace-pre-line">{message.text}</p>
          {emails.map((item) => (
            <EmailCard key={item.decision.id} item={item} />
          ))}
          {message.proposal && <RuleCard proposal={message.proposal} answered={message.answered} index={index} items={items} />}
        </div>
      </FromOscar>
      {message.problem && <p className="ml-[54px] max-w-[546px] text-xs text-muted-foreground sm:ml-[66px]">Basic answer. {message.problem}</p>}
    </div>
  );
}

/** Three dots while Oscar writes back. */
export function Typing() {
  return (
    <div role="status">
      <FromOscar pose="typing">
        <div className="flex gap-1.5 rounded-[22px] rounded-bl-md border bg-card px-[18px] py-[19px]">
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          <span className="size-2 rounded-full bg-muted-foreground/70" />
          <span className="size-2 rounded-full bg-muted-foreground" />
          <span className="sr-only">Oscar is writing</span>
        </div>
      </FromOscar>
    </div>
  );
}
