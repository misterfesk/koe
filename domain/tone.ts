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
      welcome: "Good to see you. Here's one small thing.",
      chosen: "This one's yours. Try it whenever suits you.",
      done: "You did it. That counts.",
      setback:
        "That's useful to know. Leave it there, or try a smaller version.",
      reflection: "There's no right answer here.",
      conversation: "Say as much or as little as you like.",
      journal: "A few words is enough. So is none.",
      review: "Nothing here is graded.",
      reflected: "Nicely done. That's written down.",
      help: "Reach a person who can help.",
    },
    calm: {
      welcome: "One thing at a time.",
      chosen: "Your step is here when you want it.",
      done: "Recorded. That counts.",
      setback:
        "That's useful to know. Leave it there, or try a smaller version.",
      reflection: "There's no right answer here.",
      conversation: "Say as much or as little as you like.",
      journal: "A few words is enough. So is none.",
      review: "Nothing here is graded.",
      reflected: "Written down for this session.",
      help: "Reach a person who can help.",
    },
    plain: {
      welcome: "Choose an optional step.",
      chosen: "Step chosen.",
      done: "Recorded.",
      setback: "Recorded. You can change the step.",
      reflection: "Optional reflection.",
      conversation: "Optional scripted conversation.",
      journal: "Optional note.",
      review: "Optional review.",
      reflected: "Saved for this session.",
      help: "Support resources.",
    },
  };
  return { mode, message: copy[mode][context] };
}
