import "server-only";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const migrationsFolder = join(process.cwd(), "drizzle");

/**
 * `file:<dir>` runs embedded Postgres (PGlite) in-process: zero setup locally.
 * `postgres://...` connects to a real server for hosted deployments.
 * Both speak the same dialect, so schema and queries are shared.
 */
export async function openDb(url: string): Promise<Db> {
  if (url.startsWith("file:") || url === "memory:") {
    const dir = url === "memory:" ? undefined : resolve(url.slice(5));
    if (dir) mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder });
    return db;
  }
  const client = postgres(url, { max: 10 });
  const db = drizzlePostgres(client, { schema });
  await migratePostgres(db, { migrationsFolder });
  // The two drivers expose the same query builder surface for our usage.
  return db as unknown as Db;
}

// Survive dev hot reloads: PGlite allows only one open handle per directory.
const g = globalThis as unknown as { __koeDb?: Promise<Db> };

export function db(): Promise<Db> {
  g.__koeDb ??= openDb(env().DATABASE_URL);
  return g.__koeDb;
}
