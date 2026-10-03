"use client";

import { useState } from "react";
import { KindsOfEmail } from "@/components/knows/kinds";
import { SendersIKnow } from "@/components/knows/senders-i-know";
import { usePermissions } from "@/components/kinds-of-email";
import { MoodHeader } from "@/components/kit/mood-header";
import { Loading, Page } from "@/components/page";
import { useOscar } from "@/lib/use-oscar";

/** What Oscar knows about you: what he learned about each sender, and where he starts with each kind of email. */
export function KnowsPage() {
  const { data, error, feedback } = useOscar();
  const { rows, failed } = usePermissions();
  const [now] = useState(() => Date.now());

  return (
    <Page className="max-w-[800px] gap-10">
      <MoodHeader
        pose="reporting"
        title="What I know about you"
        text="I picked these up from your answers. Change or forget any of them."
      />
      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <SendersIKnow data={data} onFeedback={feedback} now={now} />
          <KindsOfEmail data={data} rules={rows} failed={failed} />
        </>
      )}
    </Page>
  );
}
