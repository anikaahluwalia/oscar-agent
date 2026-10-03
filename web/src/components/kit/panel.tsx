import { cn } from "@/lib/utils";

/** A white card from the mock-up, with an optional title row (title on the left, an action on the right). */
export function Panel({
  title,
  action,
  children,
  className,
  as: Tag = "section",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card", className)}>
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
