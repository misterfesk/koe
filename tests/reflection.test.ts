import { describe, expect, it } from "vitest";
import { initialState, reducer, suggestions } from "../domain/state";
import {
  approveMemory,
  conversationOption,
  conversationSuggestion,
  journalActions,
  prepareConversationStep,
  prepareReflectionStep,
  thoughtInput,
} from "../domain/reflection";

describe("explicit memory and fresh retrieval", () => {
  it("requires nonblank, bounded text and explicit permission", () => {
    const state = initialState();
    expect(approveMemory(state, "   ", "Explicit preference").ok).toBe(false);
    expect(
      approveMemory(state, "x".repeat(1001), "Explicit preference").ok,
    ).toBe(false);
    expect(
      approveMemory({ ...state, temporary: true }, "Books", "Conversation").ok,
    ).toBe(false);
    expect(
      approveMemory({ ...state, memoryConsent: false }, "Books", "Conversation")
        .ok,
    ).toBe(false);
    expect(state.memories).toEqual([]);
  });

  it("preserves user words, provenance/date and makes deletion affect later ideas", () => {
    let state = initialState();
    const result = approveMemory(
      state,
      "  Reading a poem  ",
      "Scripted conversation: explicit preference",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Approval should be valid");
    state = reducer(state, result.action);
    expect(state.memories[0]).toMatchObject({
      text: "Reading a poem",
      source: "Scripted conversation: explicit preference",
      at: state.clock,
    });
    expect(conversationSuggestion(state, true)).toContain("Reading a poem");
    const id = state.memories[0].id;
    state = reducer(state, { type: "memoryEdit", id, text: "Reading a line" });
    expect(conversationSuggestion(state, true)).toContain("Reading a line");
    state = reducer(state, { type: "memoryDelete", id });
    expect(suggestions(state).join(" ")).not.toContain("Reading a line");
    expect(conversationSuggestion(state, true)).not.toContain("Reading a line");
  });

  it("does not show an idea without consent, online fixtures or ordinary coaching", () => {
    const state = initialState();
    expect(conversationSuggestion(state, false)).toBeNull();
    expect(
      conversationSuggestion({ ...state, providerEnabled: false }, true),
    ).toBeNull();
    expect(
      conversationSuggestion(initialState("coaching paused"), true),
    ).toBeNull();
  });

  it("temporary mode omits previously approved cards without deleting them", () => {
    let state = reducer(initialState(), {
      type: "memoryAdd",
      text: "A quiet poem",
      source: "Explicit",
    });
    state = reducer(state, { type: "temporary", value: true });
    expect(conversationSuggestion(state, true)).not.toContain("A quiet poem");
    expect(state.memories).toHaveLength(1);
    const result = approveMemory(state, "New card", "Explicit");
    expect(result.ok).toBe(false);
  });

  it("keeps approved-memory provenance on a chosen idea and refuses unavailable sources", () => {
    let state = reducer(initialState(), {
      type: "memoryAdd",
      text: "Read a fictional line",
      source: "Explicit preference",
    });
    const option = conversationOption(state, true);
    expect(option?.sourceMemoryId).toBe(state.memories[0].id);
    if (!option) throw new Error("Expected a permitted idea");
    const choice = prepareConversationStep(
      state,
      true,
      option.title,
      option.sourceMemoryId,
    );
    expect(choice.ok).toBe(true);
    if (!choice.ok) throw new Error("Expected a valid choice");
    state = reducer(state, choice.action);
    expect(state.steps[0].sourceMemoryId).toBe(option.sourceMemoryId);
    state = reducer(state, {
      type: "memoryDelete",
      id: option.sourceMemoryId!,
    });
    expect(
      prepareConversationStep(state, true, option.title, option.sourceMemoryId)
        .ok,
    ).toBe(false);
    expect(state.steps).toHaveLength(1);
  });
});

describe("reflection handoffs stay optional and faithful", () => {
  it("places an editable step draft in the shared planner without choosing or reporting it", () => {
    let state = initialState();
    const result = prepareReflectionStep(
      state,
      "  Read one line  ",
      "Enjoyment",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Step should be valid");
    for (const action of result.actions) state = reducer(state, action);
    expect(state.drafts["step.title"]).toBe("Read one line");
    expect(state.drafts["step.area"]).toBe("Enjoyment");
    expect(state.steps).toEqual([]);
    expect(prepareReflectionStep(initialState(), "   ", "Rest").ok).toBe(false);
    expect(prepareReflectionStep(state, "Another action", "Rest").ok).toBe(
      false,
    );
    const predictionOnly = reducer(initialState(), {
      type: "draft",
      key: "step.prediction",
      value: "A prediction I have not finished",
    });
    expect(
      prepareReflectionStep(predictionOnly, "Another action", "Rest").ok,
    ).toBe(false);
  });

  it("records only reported energy/text and never creates implicit memory", () => {
    let state = initialState();
    const result = journalActions("  Fictional afternoon note  ", "low");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Note should be valid");
    for (const action of result.actions) state = reducer(state, action);
    expect(state.journal[0]).toMatchObject({
      text: "Fictional afternoon note",
      energy: "low",
    });
    expect(state.energy).toBe("low");
    expect(state.memories).toEqual([]);
    expect(journalActions("", "unknown").ok).toBe(false);
  });

  it("allows every thought-reflection prompt to be skipped without inventing an alternative", () => {
    expect(
      thoughtInput.safeParse({
        situation: "",
        thought: "",
        feeling: "",
        alternative: "",
      }).success,
    ).toBe(true);
    const result = thoughtInput.safeParse({
      situation: "A real practical barrier",
      thought: "This is hard",
      feeling: "Tired",
      alternative: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.alternative).toBe("");
    expect(
      thoughtInput.safeParse({
        situation: "x".repeat(1001),
        thought: "",
        feeling: "",
        alternative: "",
      }).success,
    ).toBe(false);
  });
});
