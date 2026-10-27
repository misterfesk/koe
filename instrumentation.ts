// Runs once when the server starts. Koe checks for due reminders every
// minute, and expired chat history every hour, in-process: fine for one
// server. Several instances would need a shared job runner (or a row lock)
// so reminders aren't sent twice.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.KOE_SCHEDULER === "off") return;
  const g = globalThis as unknown as { __koeScheduler?: boolean };
  if (g.__koeScheduler) return;
  g.__koeScheduler = true;
  const { db } = await import("./server/db");
  const { runDueReminders } = await import("./server/push");
  const { purgeExpiredTranscripts } = await import("./server/data/talk");
  let running = false;
  let ticks = 0;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const database = await db();
      await runDueReminders(database);
      // Hourly: delete conversations for people who turned chat history off.
      if (ticks++ % 60 === 0) await purgeExpiredTranscripts(database);
    } catch (error) {
      console.error("[koe] reminder run failed", (error as Error).message);
    } finally {
      running = false;
    }
  }, 60_000).unref();
}
