import type { Energy } from "./steps";

export type ToneSetting = "expressive" | "calm" | "plain";
export type ToneContext =
  | "welcome"
  | "chosen"
  | "done"
  | "setback"
  | "enough"
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

const copy = {
  expressive: {
    welcome: "Good to see you. Here's your day.",
    chosen: "Take your day at your own pace.",
    done: "You did it. That counts.",
    setback: "That's useful to know. Leave it there, or try a smaller version.",
    enough: "That's enough for today, if you want it to be.",
    reflection: "There's no right answer here.",
    conversation: "Say as much or as little as you like.",
    journal: "A few words is enough. So is none.",
    review: "Nothing here is graded.",
    reflected: "Nicely done. That's written down.",
    help: "Reach a person who can help.",
  },
  calm: {
    welcome: "One thing at a time.",
    chosen: "Your day is here when you want it.",
    done: "Recorded. That counts.",
    setback: "That's useful to know. Leave it there, or try a smaller version.",
    enough: "That's enough for today, if you want it to be.",
    reflection: "There's no right answer here.",
    conversation: "Say as much or as little as you like.",
    journal: "A few words is enough. So is none.",
    review: "Nothing here is graded.",
    reflected: "Written down.",
    help: "Reach a person who can help.",
  },
  plain: {
    welcome: "Today",
    chosen: "Today's plan.",
    done: "Recorded.",
    setback: "Recorded. You can change today's plan.",
    enough: "Nothing else is planned today.",
    reflection: "Optional reflection.",
    conversation: "Talk",
    journal: "Optional note.",
    review: "Optional look-back.",
    reflected: "Saved.",
    help: "Support resources.",
  },
} satisfies Record<ToneSetting, Record<ToneContext, string>>;

/**
 * The voice line for a moment. A safety signal always forces the calm voice:
 * no warm completion lines after someone wrote something alarming.
 */
export function tone(
  setting: ToneSetting,
  context: ToneContext,
  energy: Energy | null,
  safety = false,
) {
  const mode =
    setting === "plain"
      ? "plain"
      : setting === "calm" ||
          safety ||
          energy === "low" ||
          calmContexts.includes(context)
        ? "calm"
        : "expressive";
  return { mode, message: copy[mode][context] };
}
