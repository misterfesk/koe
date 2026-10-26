/** Changes only fixture time. No timer, notification API or wall-clock work runs. */
export function advanceClock(iso: string, hours: number): string | null {
  const timestamp = Date.parse(iso);
  const next = timestamp + hours * 60 * 60 * 1000;
  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(next) ||
    Math.abs(next) > 8.64e15
  )
    return null;
  return new Date(next).toISOString();
}
