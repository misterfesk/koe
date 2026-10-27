import "server-only";
import { detectRisk, highest, type RiskLevel } from "@/domain/safety";
import { recordSafetyEvent, updateProfile } from "./data/profile";
import type { Db } from "./db";

/**
 * Screens everything a person just wrote with the deterministic check. A hit
 * is logged without the text and pauses coaching until the person chooses
 * to carry on. Their words are still saved: they belong to
 * them, and losing them would be a second harm.
 *
 * UNREVIEWED engineering default; see domain/safety.ts.
 */
export async function screen(
  db: Db,
  userId: string,
  surface: string,
  texts: (string | null | undefined)[],
): Promise<RiskLevel> {
  const level = highest(...texts.map((t) => (t ? detectRisk(t) : "none")));
  if (level === "none") return level;
  await recordSafetyEvent(db, userId, { level, source: "rules", surface });
  await updateProfile(db, userId, { coachingPausedAt: new Date() });
  return level;
}
