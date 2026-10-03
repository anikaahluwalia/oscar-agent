"use client";

import { useEffect, useState } from "react";
import { LockIcon } from "lucide-react";
import { Ladder } from "@/components/ladder";
import { ProtectedRuleCard } from "@/components/protected-rule-card";
import { getPermissions, type PermissionRow } from "@/lib/api";
import { ACTIONS, KIND_NAMES, PROTECTED_RULES } from "@/lib/labels";
import { useOscar } from "@/lib/use-oscar";

const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** The rules for each kind of email, straight from the API, so this never drifts from the code. */
export function usePermissions() {
  const { data } = useOscar();
  const [rows, setRows] = useState<PermissionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Fetch again when Oscar's data refreshes, so a rule you just set or forgot for a kind of email shows up.
  useEffect(() => {
    getPermissions().then(
      (r) => {
        setRows(r);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [data]);
  return { rows, failed };
}

/** What Oscar may do on his own with each kind of email, before he's learned anything about a sender. */
export function KindsOfEmail() {
  const { rows, failed } = usePermissions();
  return <KindsOfEmailList rows={rows} failed={failed} />;
}

/** The same list, for a page that already has the rules (so it doesn't fetch them twice). */
export function KindsOfEmailList({ rows, failed }: { rows: PermissionRow[] | null; failed: boolean }) {
  if (failed) return <p className="text-sm text-muted-foreground">I can&apos;t reach my API, so I can&apos;t show my rules.</p>;
  if (!rows) return null;
  const open = rows.filter((r) => r.floor !== "ESCALATE");
  return (
    <ul className="flex flex-col divide-y">
      {open.map((r) => (
        <li key={r.action} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 sm:w-64 sm:shrink-0">
            <p className="font-medium">{KIND_NAMES[r.email_type] ?? r.email_type}</p>
            <p className="text-sm text-muted-foreground">
              {ACTIONS[r.action]} · {r.reason}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <Ladder row={{ level: r.level, floor: r.floor, floor_reason: r.reason, ceiling: r.ceiling }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What always comes to you, whatever Oscar learns: the money and password rules, and the protected rules. */
export function AlwaysComesToYou() {
  const { rows } = usePermissions();
  const stopped = (rows ?? []).filter((r) => r.floor === "ESCALATE");
  return (
    <div className="flex flex-col gap-3">
      {stopped.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {stopped.map((r) => (
            <li key={r.action} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">
              <LockIcon className="size-3.5 text-muted-foreground" aria-hidden />
              {KIND_NAMES[r.email_type] ?? r.email_type}: {sentence(r.reason)}
            </li>
          ))}
        </ul>
      )}
      <ul className="flex flex-col gap-3">
        {PROTECTED_RULES.map((rule) => (
          <ProtectedRuleCard key={rule.title} rule={rule} />
        ))}
      </ul>
    </div>
  );
}
