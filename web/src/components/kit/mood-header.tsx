import { OscarMood, type OscarPose } from "@/components/oscar-mood";

/** The top of a page: Oscar in the pose that fits, a big line in his words, and a smaller one under it. */
export function MoodHeader({
  pose,
  title,
  text,
  size = 96,
  children,
}: {
  pose: OscarPose;
  title: React.ReactNode;
  text?: React.ReactNode;
  size?: number;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <OscarMood pose={pose} size={size} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.03em] sm:text-[34px]">{title}</h1>
        {text && <p className="text-base text-muted-foreground">{text}</p>}
      </div>
      {children}
    </header>
  );
}
