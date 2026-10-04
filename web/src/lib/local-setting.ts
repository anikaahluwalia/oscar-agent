"use client";

// Settings kept in this browser only, for things the API doesn't store yet.

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "oscar:setting";
// When storage is blocked (some private windows), a setting lasts as long as the page does.
const memory = new Map<string, string | null>();

/** One saved setting, or null. Safe to call before the browser has loaded (it's null there). */
export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(`oscar.${key}`);
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Save a setting (null forgets it), and tell everything showing it. */
export function writeSetting(key: string, value: string | null) {
  memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(`oscar.${key}`);
    else window.localStorage.setItem(`oscar.${key}`, value);
  } catch {
    // Private windows can block storage; the setting just won't stick.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeSettings(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocalSetting<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(subscribeSettings, () => (readSetting(key) as T | null) ?? fallback, () => fallback);
  const set = useCallback((next: T) => writeSetting(key, next), [key]);
  return [value, set];
}
