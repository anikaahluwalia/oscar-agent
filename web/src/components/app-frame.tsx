"use client";

import { usePathname } from "next/navigation";
import { DemoBanner } from "@/components/demo/demo-banner";
import { DemoTour } from "@/components/demo/tour";
import { Sidebar } from "@/components/sidebar";
import { WhyDrawer } from "@/components/why-drawer";

/**
 * The app around each page: the menu, the demo banner and tour, and the Why drawer. The front
 * page ("/") stands on its own, and loads nothing about an inbox until you pick one.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  if (usePathname() === "/") return <div className="flex flex-1 flex-col">{children}</div>;
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
