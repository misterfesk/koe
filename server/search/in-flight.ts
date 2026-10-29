// Shelf refreshes in flight per person, for the UI's loading state. Koe runs
// as one instance (PGlite), so process memory is the source of truth.
const running = new Map<string, number>();

export const shelfLoading = (userId: string) => (running.get(userId) ?? 0) > 0;

/** Marks a refresh as running; call the returned function once when it ends. */
export function markShelfRunning(userId: string) {
  running.set(userId, (running.get(userId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = (running.get(userId) ?? 1) - 1;
    if (n > 0) running.set(userId, n);
    else running.delete(userId);
  };
}
