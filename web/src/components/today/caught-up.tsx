import { OscarMood } from "@/components/oscar-mood";

/** Nothing needs you: a calm card, on purpose with nothing to press. */
export function CaughtUp({ readOnly }: { readOnly: boolean }) {
  return (
    <section aria-label="All caught up" data-tour="today-caught-up" className="flex flex-col items-center gap-4 rounded-[24px] border bg-card px-6 py-8 text-center sm:flex-row sm:gap-8 sm:px-12 sm:py-10 sm:text-left">
      <OscarMood pose="sleeping" size={160} className="size-28 sm:size-40" />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-[-0.02em] sm:text-[28px]">All caught up!</h2>
        <p className="max-w-[26rem] text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
          {readOnly
            ? "I'm only reading your Gmail for now. I'll bring you anything that needs you."
            : "I'll handle what I can and bring you anything that needs you."}
        </p>
      </div>
    </section>
  );
}
