"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The part of the URL after #, without the #. Links like /inbox#<id> and /review#<id> use it to pick an email. */
export function useHash() {
  return useSyncExternalStore(subscribe, () => window.location.hash.slice(1), () => "");
}

export function setHash(id: string) {
  window.location.hash = id;
}
