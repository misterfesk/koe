"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** A tab-local, owner-scoped draft; storage failures leave the form usable. */
export function useDraft<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, () => void, boolean] {
  const storageKey = "koe.plan-draft:" + key;
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        // Browser storage is read after hydration, as with the intake draft.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      /* A blocked store does not block planning. */
    }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (ready)
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* Tab-local drafts are best effort. */
      }
  }, [ready, storageKey, value]);
  return [
    value,
    setValue,
    () => {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Nothing to clear. */
      }
    },
    ready,
  ];
}
