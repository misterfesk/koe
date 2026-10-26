import { it, expect } from "vitest";
import { initialState, reducer } from "../domain/state";
function linked() {
  let s = reducer(initialState(), {
    type: "memoryAdd",
    text: "Books",
    source: "Explicit approval",
  });
  const sourceMemoryId = s.memories[0].id;
  s = reducer(s, {
    type: "choose",
    title: "Make room for Books",
    area: "Enjoyment",
    prediction: "",
    sourceMemoryId,
  });
  s = reducer(s, {
    type: "reminders",
    value: { ...s.reminders, enabled: true, targetId: s.activeId },
  });
  return s;
}
it("forgetting memory cancels its pending linked reminder while preserving the separately chosen plan", () => {
  let s = linked();
  const title = s.steps[0].title;
  s = reducer(s, { type: "memoryDelete", id: s.memories[0].id });
  expect(s.memories).toHaveLength(0);
  expect(s.reminders.enabled).toBe(false);
  expect(s.reminders.targetId).toBe("");
  expect(s.steps[0].title).toBe(title);
});
it("temporary mode and revoked memory consent cancel linked preview permission", () => {
  const s = linked();
  expect(reducer(s, { type: "temporary", value: true }).reminders.enabled).toBe(
    false,
  );
  expect(
    reducer(s, { type: "memoryConsent", value: false }).reminders.enabled,
  ).toBe(false);
});
it("cannot choose from unavailable memory provenance", () => {
  const s = reducer(initialState(), {
    type: "choose",
    title: "Stale suggestion",
    area: "Rest",
    prediction: "",
    sourceMemoryId: "removed",
  });
  expect(s.steps).toHaveLength(0);
});
it("clears an exact draft key without touching a longer step ID", () => {
  let s = reducer(initialState(), {
    type: "draft",
    key: "routine.edit.step-1",
    value: "A",
  });
  s = reducer(s, { type: "draft", key: "routine.edit.step-10", value: "Keep" });
  s = reducer(s, { type: "clearDraft", prefix: "routine.edit.step-1" });
  expect(s.drafts["routine.edit.step-10"]).toBe("Keep");
});

it("keeps earlier unreported plan versions and predictions", () => {
  let s = reducer(initialState(), {
    type: "choose",
    title: "Read a page",
    area: "Enjoyment",
    prediction: "Might be too much",
  });
  const id = s.activeId;
  s = reducer(s, { type: "propose", id, title: "Read a line" });
  s = reducer(s, { type: "acceptAdjustment", id });
  expect(s.steps[0].versions).toMatchObject([
    { version: 1, title: "Read a page", prediction: "Might be too much" },
    { version: 2, title: "Read a line" },
  ]);
  expect(s.steps[0].reports).toEqual([]);
});
