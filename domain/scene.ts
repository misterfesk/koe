export const sceneIds = [
  "morning",
  "afternoon",
  "evening",
  "night",
  "lighter",
] as const;
export type SceneId = (typeof sceneIds)[number];

/** The greeting scene: by local hour, or "lighter" on a lighter day. */
export function sceneFor(hour: number, lighter = false): SceneId {
  if (lighter) return "lighter";
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 21) return "evening";
  return "night";
}
