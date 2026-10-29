/** An app URL on this machine only: http on 127.0.0.1 or localhost, any port. */
const LOCAL_APP_URL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function isLocalAppUrl(url = process.env.APP_URL ?? "http://127.0.0.1") {
  return LOCAL_APP_URL.test(url);
}

/** `file:` (PGlite) or a Postgres URL whose host is this machine. */
export function isLocalDatabaseUrl(url: string) {
  if (url.startsWith("file:")) return true;
  try {
    const u = new URL(url);
    return (
      (u.protocol === "postgres:" || u.protocol === "postgresql:") &&
      LOCAL_HOSTS.has(u.hostname) &&
      // postgres.js lets ?host= override the host in the URL.
      !u.searchParams.has("host")
    );
  } catch {
    return false;
  }
}

/** A request Host header (with or without port) naming this machine. */
export function isLocalHost(host: string | null) {
  if (!host) return false;
  return LOCAL_HOSTS.has(host.replace(/:\d+$/, "").toLowerCase());
}

/**
 * Why local-only tooling must refuse to run here, or null when it may.
 * Reads the environment at call time.
 */
export function localOnlyRefusal(e: NodeJS.ProcessEnv = process.env) {
  // An explicit opt-in: `next start` runs as production even on this machine.
  if (e.KOE_DEMO !== "on")
    return "Refused: set KOE_DEMO=on to use local demo tools.";
  if (!isLocalAppUrl(e.APP_URL ?? "http://127.0.0.1"))
    return "Refused: APP_URL is not http://127.0.0.1 or http://localhost.";
  if (!isLocalDatabaseUrl(e.DATABASE_URL ?? "file:./.data/pglite"))
    return "Refused: DATABASE_URL is not a local database.";
  return null;
}
