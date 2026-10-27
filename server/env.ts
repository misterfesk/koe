import "server-only";
import { z } from "zod";

// Validated once on first use so a missing secret fails loudly at startup
// instead of surfacing as a confusing provider or cookie error later.
const schema = z.object({
  NEBIUS_API_KEY: z.string().min(20, "NEBIUS_API_KEY is missing"),
  NEBIUS_BASE_URL: z.url().default("https://api.tokenfactory.nebius.com/v1/"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded",
    ),
  DATABASE_URL: z.string().default("file:./.data/pglite"),
  APP_URL: z.url().default("http://127.0.0.1:3100"),
  // Model routing is configuration, not code: swap without a release.
  KOE_CHAT_MODEL: z.string().default("deepseek-ai/DeepSeek-V4.1-Flash"),
  KOE_DEEP_MODEL: z.string().default("moonshotai/Kimi-K3"),
  KOE_SAFETY_MODEL: z.string().default("deepseek-ai/DeepSeek-V4.1-Flash"),
  // Operator kill switch: "off" keeps Help, history and manual steps working.
  KOE_AI: z.enum(["on", "off"]).default("on"),
  // Web Push for reminders. Without keys, reminders are simply unavailable.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:koe-owner@example.invalid"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
