import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 640px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True on anything wider than a phone. Phones get the short card, so a real email isn't fetched there. */
export const useWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
