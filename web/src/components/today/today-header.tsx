import { OscarMood, type OscarPose } from "@/components/oscar-mood";

/** The top of Today: Oscar in the pose that fits, a big line in his words, and a smaller one. On a phone he sits above the words. */
export function TodayHeader({ pose, title, text, children }: { pose: OscarPose; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:gap-5">
      <OscarMood pose={pose} size={112} className="size-[88px] sm:size-28" />
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 sm:gap-2">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em] text-balance sm:text-[40px] sm:leading-[1.08]">{title}</h1>
        {text && <p className="text-[15px] leading-normal text-muted-foreground sm:text-[17px]">{text}</p>}
      </div>
      {children}
    </header>
  );
}
