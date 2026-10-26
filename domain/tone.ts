export type ToneSetting = "expressive" | "calm" | "plain";
export type Energy = "low" | "steady" | "more" | "unknown";
export type ToneContext =
  | "welcome"
  | "chosen"
  | "done"
  | "setback"
  | "reflection"
  | "conversation"
  | "journal"
  | "review"
  | "reflected"
  | "help";
// While someone is reflecting, or after a setback, or in Help, the voice is calm.
// "reflected" (a reflection or note just finished) is a warm moment unless energy is low (D022).
const calmContexts: ToneContext[] = [
  "setback",
  "reflection",
  "conversation",
  "journal",
  "review",
  "help",
];
export function tone(
  setting: ToneSetting,
  context: ToneContext,
  energy: Energy,
) {
  const mode =
    setting === "plain"
      ? "plain"
      : setting === "calm" || energy === "low" || calmContexts.includes(context)
        ? "calm"
        : "expressive";
  const copy = {
    expressive: {
      welcome: "A little room for what matters.",
      chosen: "A step that's yours. Take it at your pace.",
      done: "You made room for something that matters.",
      setback: "We can leave it here, or try a different shape.",
      reflection: "There is no right answer here.",
      conversation: "Say as much or as little as you like.",
      journal: "A few words, or none, is enough.",
      review: "Look back gently. Nothing here is graded.",
      reflected: "That was a little room for you. Nice.",
      help: "Human support, at your pace.",
    },
    calm: {
      welcome: "One thing at a time.",
      chosen: "Your step is here when you want it.",
      done: "Your experience is recorded.",
      setback: "We can leave it here, or try a different shape.",
      reflection: "There is no right answer here.",
      conversation: "Say as much or as little as you like.",
      journal: "A few words, or none, is enough.",
      review: "Look back gently. Nothing here is graded.",
      reflected: "Kept for this session.",
      help: "Human support, at your pace.",
    },
    plain: {
      welcome: "Choose an optional step.",
      chosen: "Step chosen.",
      done: "Report recorded.",
      setback: "Report recorded. Adjustment is optional.",
      reflection: "Optional reflection.",
      conversation: "Optional scripted conversation.",
      journal: "Optional note.",
      review: "Optional review.",
      reflected: "Saved.",
      help: "Support resources.",
    },
  };
  return { mode, message: copy[mode][context] };
}
