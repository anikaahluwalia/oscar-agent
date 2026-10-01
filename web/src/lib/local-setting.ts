"use client";

// Settings kept in this browser only, for things the API doesn't store yet.

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "oscar:setting";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(`oscar.${key}`);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocalSetting<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(subscribe, () => (read(key) as T | null) ?? fallback, () => fallback);
  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(`oscar.${key}`, next);
      } catch {
        // Private windows can block storage; the setting just won't stick.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
