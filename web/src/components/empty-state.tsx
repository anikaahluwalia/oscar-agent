import { OscarAvatar, type Mood } from "@/components/oscar-avatar";

type Props = { title: string; text?: string; mood?: Mood; children?: React.ReactNode };

export function EmptyState({ title, text, mood = "calm", children }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
      <OscarAvatar size={56} mood={mood} />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
      </div>
      {children}
    </div>
  );
}
