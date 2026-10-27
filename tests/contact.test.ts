// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mentionsContact } from "@/server/llm/talk";

describe("model replies never carry contact details", () => {
  it.each([
    "You could reach the line at 1-800-273-8255",
    "Call 988 right now",
    "Please ring 116 123, they're there all night",
    "The Samaritans are good to talk to",
    "There's a crisis text line you can use",
    "Have a look at www.example.org",
    "See https://example.com/help",
  ])("catches: %s", (text) => {
    expect(mentionsContact(text)).toBe(true);
  });

  it.each([
    "Maybe call her for 10-15 minutes this evening",
    "That's a 111 day streak of trying",
    "Walk for 20 minutes after lunch",
    "Could you text a friend tonight?",
  ])("leaves ordinary replies alone: %s", (text) => {
    expect(mentionsContact(text)).toBe(false);
  });
});
