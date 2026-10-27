import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Live evaluation against the real model provider. Costs a little and needs
// NEBIUS_API_KEY in .env.local. Run on every prompt or model change:
//   npm run eval:safety
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    testTimeout: 120_000,
    maxConcurrency: 4,
  },
});
