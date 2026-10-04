"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DemoBanner } from "@/components/demo/demo-banner";
import { DemoTour } from "@/components/demo/tour";
import { Sidebar } from "@/components/sidebar";
import { WhyDrawer } from "@/components/why-drawer";
import { getRealGmailStatus } from "@/lib/api";
import { useDemoSession } from "@/lib/use-oscar";

/**
 * The app around each page: the menu, the demo banner and tour, and the Why drawer. The front
 * page ("/") stands on its own, and loads nothing about an inbox until you pick one. On a copy that
 * only runs the demo, a page opened without a demo goes back to the front page to start one.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const front = usePathname() === "/";
  const router = useRouter();
  const session = useDemoSession();
  // Without a demo: undefined while asking the API, then whether this copy only runs the demo.
  const [demoOnly, setDemoOnly] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (front || session) return;
    getRealGmailStatus().then(
      (s) => setDemoOnly(!!s.only_demo),
      () => setDemoOnly(false),
    );
  }, [front, session]);
  useEffect(() => {
    if (!front && !session && demoOnly) router.replace("/");
  }, [front, session, demoOnly, router]);

  if (front) return <div className="flex flex-1 flex-col">{children}</div>;
  if (!session && demoOnly !== false) return null;
  return (
    <>
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <DemoBanner />
          {children}
        </div>
      </div>
      <WhyDrawer />
      <DemoTour />
    </>
  );
}
