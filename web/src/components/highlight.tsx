import { cn } from "@/lib/utils";

/** Shows `text` with the first match of `phrase` marked, so you can see what Oscar noticed. */
export function Highlight({ text, phrase, className }: { text: string; phrase: string | null; className?: string }) {
  const at = phrase ? text.toLowerCase().indexOf(phrase.toLowerCase()) : -1;
  if (!phrase || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className={cn("rounded-sm px-0.5 text-foreground", className)}>{text.slice(at, at + phrase.length)}</mark>
      {text.slice(at + phrase.length)}
    </>
  );
}
