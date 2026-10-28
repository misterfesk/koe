import { describe, expect, it } from "vitest";
import {
  chatTurnSchema,
  parseChatTurn,
  OTHER_OPTION_ID,
} from "@/domain/chat-turn";

const options = (count: number) =>
  Array.from({ length: count }, (_, id) => ({
    id: String(id),
    label: `Choice ${id}`,
  }));
const turn = (kind: "single" | "multi" | "text", count: number) => ({
  message: "What fits today?",
  ask: { kind, allowOther: true, options: options(count) },
  phase: "intro",
});

describe("chat turn contract", () => {
  it("accepts message-only turns, five single choices and eleven multi choices", () => {
    expect(
      chatTurnSchema.safeParse({ message: "Your day is ready.", phase: "done" })
        .success,
    ).toBe(true);
    expect(chatTurnSchema.safeParse(turn("single", 5)).success).toBe(true);
    expect(chatTurnSchema.safeParse(turn("multi", 11)).success).toBe(true);
  });
  it.each([
    ["single", 6],
    ["multi", 12],
    ["single", 0],
    ["multi", 0],
    ["text", 1],
  ] as const)("rejects %s with %i options", (kind, count) => {
    expect(chatTurnSchema.safeParse(turn(kind, count)).success).toBe(false);
  });
  it("rejects duplicate and reserved option ids", () => {
    for (const ids of [["a", "a"], [OTHER_OPTION_ID]]) {
      const input = turn("single", 1);
      input.ask.options = ids.map((id) => ({ id, label: "Sleep" }));
      expect(chatTurnSchema.safeParse(input).success).toBe(false);
    }
  });
  it.each([
    null,
    {},
    { message: "Unchecked words", phase: "intro", ask: { kind: "bogus" } },
    turn("single", 6),
  ])(
    "replaces the entire malformed turn with a safe plain-text ask",
    (input) => {
      const result = parseChatTurn(input);
      expect(result).toMatchObject({
        message: "What would you like to share?",
        phase: "fallback",
        ask: { kind: "text", allowOther: false },
      });
      expect(result.ask?.placeholder).toContain("e.g.");
    },
  );
});
