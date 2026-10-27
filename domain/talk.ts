export type TalkMode =
  "talk" | "plan" | "problem" | "thought" | "reach" | "care";

export const modeLabels: Record<TalkMode, string> = {
  talk: "Just talk",
  plan: "Plan a step",
  problem: "Work through a problem",
  thought: "Look at a thought",
  reach: "Draft a message to someone",
  care: "Prepare for an appointment",
};
