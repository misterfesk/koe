"use client";
import { useEffect, useSyncExternalStore, type RefObject } from "react";

/** True while the media query matches (false on the server). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const focusable =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus: moves focus in on open, closes on Escape and gives focus back
 * to whatever opened it. With `trap`, Tab stays inside (modal dialogs).
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  { trap, onClose }: { trap: boolean; onClose: () => void },
) {
  useEffect(() => {
    const el = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    el?.querySelector<HTMLElement>(focusable)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !trap || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(focusable)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
    // Runs once per open; onClose is read when a key is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
