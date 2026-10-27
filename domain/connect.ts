// Reaching out: Koe drafts, the person edits and sends it themselves.
// People tend to underestimate how much others welcome a small message.

export type Purpose = "hello" | "meet" | "help" | "hard";

export const purposeLabels: Record<Purpose, string> = {
  hello: "Just say hi",
  meet: "Suggest meeting up",
  help: "Ask for a hand with something",
  hard: "Say I'm having a hard time",
};

/** Used when the AI is off, and as a starting point the person can edit. */
export function templateMessage(purpose: Purpose, name: string) {
  const to = name.trim() ? " " + name.trim() : "";
  switch (purpose) {
    case "hello":
      return `Hi${to}, I was thinking of you. How are things with you?`;
    case "meet":
      return `Hi${to}, would you be up for meeting up sometime soon? Even a quick coffee or a walk would be nice.`;
    case "help":
      return `Hi${to}, could I ask you for a hand with something? No worries if now isn't a good time.`;
    case "hard":
      return `Hi${to}, I've been having a hard time lately. Would you be up for a chat sometime this week?`;
  }
}

export const channelLabels = {
  message: "Message",
  call: "Call",
  email: "Email",
  in_person: "In person",
} as const;
