export const REVIEW_ENABLED = process.env.NEXT_PUBLIC_REVIEW_TOOLS !== "false";
export const featureLinks = [
  ["F01", "Today", "/today"],
  ["F02", "Getting started", "/onboarding"],
  ["F03", "Memory", "/settings/memory"],
  ["F04", "Scripted conversation", "/reflect/conversation"],
  ["F05", "Help & support", "/help"],
  ["F06", "Your data", "/settings/privacy"],
  ["F07", "Write a step", "/steps/new"],
  ["F08", "Step follow-up", "/steps"],
  ["F09", "Reminder preview", "/settings/reminders"],
  ["F10", "Weekly review", "/reflect/review"],
  ["F11", "Thought reflection", "/reflect/thoughts"],
  ["F12", "Journal", "/reflect/journal"],
  ["F13", "Reach out", "/connect"],
  ["F14", "Prepare for care", "/connect/care"],
  ["F15", "Routines", "/steps/routines"],
  ["F16", "Appearance", "/settings/appearance"],
] as const;
