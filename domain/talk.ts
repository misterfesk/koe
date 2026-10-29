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

export const modeTemplates: Record<Exclude<TalkMode, "talk">, string> = {
  plan: "Help me with planning the following work - ",
  problem: "Help me with working through the following problem - ",
  thought: "Help me with looking at the following thought - ",
  reach: "Help me with drafting a message to - ",
  care: "Help me with preparing for the following appointment - ",
};
