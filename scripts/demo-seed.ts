// Local only: one guest with three days of use and the week review due today.
// Prints a one-time sign-in link. Never prints secrets.
export {};
try {
  process.loadEnvFile(".env.local");
} catch {
  /* exported env is also supported */
}
const { localOnlyRefusal } = await import("../server/local-only");
const refusal = localOnlyRefusal();
if (refusal) {
  console.error(refusal);
  process.exit(1);
}
const { openDb } = await import("../server/db");
const { createAuth } = await import("../server/auth");
const { seedDemo } = await import("../server/demo");
try {
  const appUrl = new URL(process.env.APP_URL ?? "http://127.0.0.1:3100");
  const db = await openDb(process.env.DATABASE_URL ?? "file:./.data/pglite");
  const { token } = await seedDemo(db, createAuth(db));
  console.log(
    `Open http://127.0.0.1:${appUrl.port || "80"}/api/demo/enter?token=${token}`,
  );
  process.exit(0);
} catch (e) {
  console.error(
    `Demo seed failed: ${e instanceof Error ? e.message : "unknown error"}`,
  );
  process.exit(1);
}
