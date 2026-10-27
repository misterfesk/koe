// Runs once when the server starts. Koe checks for due reminders every
// minute in-process: fine for one server. Several instances would need a
// shared job runner (or a row lock) so reminders aren't sent twice.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.KOE_SCHEDULER === "off") return;
  const g = globalThis as unknown as { __koeScheduler?: boolean };
  if (g.__koeScheduler) return;
  g.__koeScheduler = true;
  const { db } = await import("./server/db");
  const { runDueReminders } = await import("./server/push");
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runDueReminders(await db());
    } catch (error) {
      console.error("[koe] reminder run failed", (error as Error).message);
    } finally {
      running = false;
    }
  }, 60_000).unref();
}
