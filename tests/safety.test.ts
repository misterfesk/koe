import { describe, expect, it } from "vitest";
import { detectRisk, highest } from "@/domain/safety";

describe("detectRisk", () => {
  it.each([
    "I'm going to kill myself tonight",
    "i want to end it all",
    "thinking about taking my own life",
    "I took all the pills in the cabinet",
    "I overdosed",
    "suicide tonight, I have a plan",
    "I don’t want to live anymore", // curly apostrophe
    "goodbye forever everyone",
  ])("flags explicit intent as urgent: %s", (text) => {
    expect(detectRisk(text)).toBe("urgent");
  });

  it.each([
    "I want to disappear", // stress-test finding: got a coping tip
    "honestly they would be better off without me", // got "Nicely done"
    "sometimes I wish I was dead",
    "I've been cutting myself again",
    "I can't go on like this",
    "no one would miss me",
    "I keep having suicidal thoughts",
    "I don't want to wake up tomorrow",
  ])("flags passive wishes and self-harm as concern: %s", (text) => {
    expect(detectRisk(text)).toBe("concern");
  });

  it.each([
    "",
    "I didn't get out of bed until 2pm and the laundry is piled up",
    "work is killing me lol", // figurative; not matched by design
    "I finished the 5 minute walk",
    "my friend Disappear is a band I like",
  ])("leaves ordinary text alone: %s", (text) => {
    expect(detectRisk(text)).toBe("none");
  });

  it("takes the highest of several signals", () => {
    expect(highest("none", "concern")).toBe("concern");
    expect(highest("concern", "urgent", "none")).toBe("urgent");
    expect(highest()).toBe("none");
  });
});
