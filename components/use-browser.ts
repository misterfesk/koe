import { useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * A value only the browser knows (locale, timezone, feature support). The
 * server renders `fallback`; the browser swaps in the real value on hydrate.
 * `read` must return a primitive or a stable reference.
 */
export function useBrowserValue<T>(read: () => T, fallback: T) {
  return useSyncExternalStore(never, read, () => fallback);
}
