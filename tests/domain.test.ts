import { describe, it, expect } from "vitest";
import {
  initialState,
  reducer,
  stepInput,
  suggestions,
  makeSmaller,
} from "../domain/state";
import { tone } from "../domain/tone";
describe("session and step lifecycle", () => {
  it("rejects blank titles without throwing", () => {
    expect(
      stepInput.safeParse({ title: "   ", area: "Rest", prediction: "" })
        .success,
    ).toBe(false);
  });
  it("keeps a draft across unrelated actions", () => {
    let s = initialState();
    s = reducer(s, { type: "draft", key: "step.title", value: "A draft" });
    s = reducer(s, { type: "energy", value: "low" });
    expect(s.drafts["step.title"]).toBe("A draft");
  });
  it("chooses without completing and preserves versioned reports", () => {
    let s = reducer(initialState(), {
      type: "choose",
      title: "Read one page",
      area: "Enjoyment",
      prediction: "It may be hard",
    });
    expect(s.steps[0].reports).toEqual([]);
    const id = s.steps[0].id;
    s = reducer(s, {
      type: "report",
      id,
      outcome: "Partly",
      barrier: "Too long",
      experience: "Read a line",
    });
    s = reducer(s, { type: "propose", id, title: "Read one line" });
    expect(s.steps[0].title).toBe("Read one page");
    s = reducer(s, { type: "acceptAdjustment", id });
    expect(s.steps[0].title).toBe("Read one line");
    expect(s.steps[0].reports[0]).toMatchObject({
      title: "Read one page",
      prediction: "It may be hard",
      outcome: "Partly",
      experience: "Read a line",
      version: 1,
    });
  });
  it("rejecting a proposal leaves original untouched", () => {
    let s = reducer(initialState(), {
      type: "choose",
      title: "Open a book",
      area: "Enjoyment",
      prediction: "",
    });
    const id = s.steps[0].id;
    s = reducer(s, { type: "propose", id, title: "Read the title" });
    s = reducer(s, { type: "rejectAdjustment", id });
    expect(s.steps[0].title).toBe("Open a book");
    expect(s.steps[0].proposal).toBeUndefined();
  });
  it("deleting a plan cancels its reminder", () => {
    let s = reducer(initialState(), {
      type: "choose",
      title: "Rest",
      area: "Rest",
      prediction: "",
    });
    const id = s.steps[0].id;
    s = reducer(s, {
      type: "reminders",
      value: { ...s.reminders, enabled: true, targetId: id },
    });
    s = reducer(s, { type: "deleteStep", id });
    expect(s.reminders.targetId).toBe("");
    expect(s.reminders.enabled).toBe(false);
  });
  it("temporary mode blocks memory creation and retrieval; deletion removes suggestions", () => {
    let s = reducer(initialState(), {
      type: "memoryAdd",
      text: "Books",
      source: "Explicit preference",
    });
    expect(suggestions(s).some((x) => x.includes("Books"))).toBe(true);
    s = reducer(s, { type: "temporary", value: true });
    expect(suggestions(s).some((x) => x.includes("Books"))).toBe(false);
    const before = s.memories.length;
    s = reducer(s, { type: "memoryAdd", text: "No", source: "Conversation" });
    expect(s.memories).toHaveLength(before);
    s = reducer(s, { type: "temporary", value: false });
    s = reducer(s, { type: "memoryDelete", id: s.memories[0].id });
    expect(suggestions(s).some((x) => x.includes("Books"))).toBe(false);
  });
  it("shrinking retains the activity", () =>
    expect(makeSmaller("Read a book")).toContain("Read a book"));
});
describe("tone policy", () => {
  it.each([
    "help",
    "reflection",
    "conversation",
    "journal",
    "review",
    "setback",
  ] as const)("stays calm in %s", (context) =>
    expect(tone("expressive", context, "steady").mode).toBe("calm"),
  );
  it("respects low energy and plain setting", () => {
    expect(tone("expressive", "chosen", "low").mode).toBe("calm");
    expect(tone("plain", "chosen", "steady").mode).toBe("plain");
  });
  it("is warm after choosing", () =>
    expect(tone("expressive", "chosen", "steady").message).toContain("yours"));
  it("is warm when a reflection is finished, but calm on a low-energy day", () => {
    expect(tone("expressive", "reflected", "steady").mode).toBe("expressive");
    expect(tone("expressive", "reflected", "low").mode).toBe("calm");
    expect(tone("calm", "reflected", "steady").mode).toBe("calm");
  });
  it("gives each reflection surface its own calm line", () => {
    const lines = (
      ["reflection", "conversation", "journal", "review"] as const
    ).map((context) => tone("expressive", context, "steady").message);
    expect(new Set(lines).size).toBe(lines.length);
  });
});
