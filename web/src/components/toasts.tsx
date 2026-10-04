"use client";

import { useMedia, useTourBubble } from "@/components/demo/tour";
import { Toaster } from "@/components/ui/sonner";

/**
 * Oscar's little messages, at the bottom of the screen above the phone's tabs. On a phone the demo
 * tour's bubble sits there too, so while it's showing they come in at the top instead.
 */
export function Toasts() {
  const phone = useMedia("(max-width: 767px)");
  const tour = useTourBubble();
  return <Toaster position={phone && tour ? "top-center" : "bottom-center"} mobileOffset={{ bottom: "5rem" }} />;
}
