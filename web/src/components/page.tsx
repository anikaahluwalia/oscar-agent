import { API_DOWN } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

/** The frame every page sits in: the same width and spacing everywhere. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 pt-8 pb-24 sm:px-10", className)}>{children}</main>;
}

export function PageHeader({ title, text, children }: { title: string; text?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {text && <p className="text-muted-foreground">{text}</p>}
      </div>
      {children}
    </header>
  );
}

export function Section({ title, link, children }: { title: string; link?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {link}
      </div>
      {children}
    </section>
  );
}

/** Shown when the API isn't running, or while the first load is on its way. */
export function Loading({ error }: { error: boolean }) {
  return <p className="text-sm text-muted-foreground">{error ? API_DOWN : "Checking your inbox..."}</p>;
}
