import Image from "next/image";
import { cn } from "@/lib/utils";

/** Oscar's twelve poses. Each one comes from something that really happened, never for show. */
export type OscarPose =
  | "asking" // something waits on a yes or no
  | "guarding" // he held back a risky email
  | "alert" // something looks urgent
  | "thinking" // he wasn't sure, or wants your answer
  | "checking" // looking for new email
  | "working" // reading and handling what came in
  | "typing" // writing back in the chat
  | "reporting" // here's your day
  | "sleeping" // nothing needs you
  | "done" // he just did something
  | "proud" // you said he got it right
  | "learning"; // you taught him something

const WORDS: Record<OscarPose, string> = {
  asking: "Oscar, asking you something",
  guarding: "Oscar, guarding",
  alert: "Oscar, alert",
  thinking: "Oscar, thinking",
  checking: "Oscar, checking for new email",
  working: "Oscar, sorting your email",
  typing: "Oscar, typing",
  reporting: "Oscar, holding up his report",
  sleeping: "Oscar, asleep",
  done: "Oscar, done",
  proud: "Oscar, proud",
  learning: "Oscar, learning",
};

type Props = { pose: OscarPose; size?: number; className?: string; decorative?: boolean };

export function OscarMood({ pose, size = 96, className, decorative = false }: Props) {
  return (
    <Image
      src={`/moods/${pose}.webp`}
      alt={decorative ? "" : WORDS[pose]}
      width={size}
      height={size}
      className={cn("shrink-0 select-none", className)}
      priority={size >= 80}
    />
  );
}
