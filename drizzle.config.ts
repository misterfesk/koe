import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from server/db/schema.ts
// (`npm run db:generate`). The app applies them itself on startup.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
});
