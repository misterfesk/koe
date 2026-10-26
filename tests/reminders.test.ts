import { describe, expect, it } from "vitest";
import { initialState, reducer, type State } from "../domain/state";
import { reminderInput, reminderPreview } from "../domain/reminders";
import { reviewActions } from "../domain/review";
import { advanceClock } from "../services/clock";

function planned(clock = "2026-10-25T12:00:00.000Z"): State {
  let state = reducer(initialState(), {
    type: "choose",
    title: "Read one page",
    area: "Enjoyment",
    prediction: "It may be hard",
  });
  state = {
    ...state,
    clock,
    reminders: { ...state.reminders, enabled: true, targetId: state.activeId },
  };
  return state;
}

function next(state: State) {
  const result = reminderPreview(state);
  expect(result.kind).toBe("ready");
  if (result.kind !== "ready") throw new Error("Expected a ready preview");
  return result;
}

describe("fixture reminder preview", () => {
  it("needs opt-in and an existing, unpaused target", () => {
    expect(reminderPreview(initialState()).kind).toBe("idle");
    let state = planned();
    expect(next(state).targetId).toBe(state.activeId);
    state = reducer(state, { type: "pauseStep", id: state.activeId });
    expect(reminderPreview(state).kind).toBe("idle");
    state = reducer(state, { type: "deleteStep", id: state.activeId });
    expect(reminderPreview(state).kind).toBe("idle");
    expect(state.reminders.enabled).toBe(false);
  });

  it("never creates a backlog after an absence", () => {
    const state = planned("2026-12-15T12:00:00.000Z");
    expect(next(state).at).toBe("2026-12-16T10:00:00.000Z");
  });

  it("defers a late-night preview until quiet hours end", () => {
    const state = planned("2026-10-25T21:00:00.000Z");
    state.reminders.hour = 23;
    const preview = next(state);
    expect(preview.at).toBe("2026-10-26T08:00:00.000Z");
    expect(preview.deferred).toBe(true);
  });

  it("keeps a quiet-hour-deferred event ahead of the current virtual time", () => {
    const state = planned("2026-10-26T07:00:00.000Z");
    state.reminders.hour = 23;
    expect(next(state).at).toBe("2026-10-26T08:00:00.000Z");
  });

  it("handles daytime quiet windows and equal hours as no quiet window", () => {
    const state = planned("2026-10-25T07:00:00.000Z");
    state.reminders.quietStart = 9;
    state.reminders.quietEnd = 17;
    expect(next(state).at).toBe("2026-10-25T17:00:00.000Z");
    state.reminders.quietEnd = 9;
    expect(next(state).at).toBe("2026-10-25T10:00:00.000Z");
  });

  it("honors half-hour and quarter-hour timezone offsets", () => {
    const state = planned("2026-10-25T00:00:00.000Z");
    state.reminders.timezone = "Asia/Colombo";
    expect(next(state).at).toBe("2026-10-25T04:30:00.000Z");
    state.reminders.timezone = "Asia/Kathmandu";
    expect(next(state).at).toBe("2026-10-25T04:15:00.000Z");
  });

  it("uses the chosen local weekday for weekly frequency", () => {
    const state = planned("2026-10-25T12:00:00.000Z");
    state.reminders.frequency = "weekly";
    state.reminders.weekday = 2;
    expect(next(state).at).toBe("2026-10-27T10:00:00.000Z");
  });

  it("uses one occurrence per local date during fall-back", () => {
    const state = planned("2026-11-01T05:30:00.000Z");
    Object.assign(state.reminders, {
      timezone: "America/New_York",
      hour: 1,
      quietStart: 0,
      quietEnd: 0,
    });
    expect(next(state).at).toBe("2026-11-02T06:00:00.000Z");
  });

  it("omits a nonexistent local hour during spring-forward", () => {
    const state = planned("2026-03-08T05:00:00.000Z");
    Object.assign(state.reminders, {
      timezone: "America/New_York",
      hour: 2,
      quietStart: 0,
      quietEnd: 0,
    });
    expect(next(state).at).toBe("2026-03-09T06:00:00.000Z");
  });

  it("validates bad timezone, hour and target without throwing", () => {
    const state = planned();
    state.reminders.timezone = "Not/A_Zone";
    expect(reminderPreview(state).kind).toBe("invalid");
    expect(
      reminderInput.safeParse({ ...state.reminders, timezone: "UTC", hour: 24 })
        .success,
    ).toBe(false);
    expect(
      reminderInput.safeParse({
        ...state.reminders,
        timezone: "UTC",
        targetId: "",
      }).success,
    ).toBe(false);
    state.clock = "not a date";
    expect(reminderPreview(state).kind).toBe("invalid");
  });

  it("pausing the preview and deleting its target cancel downstream output", () => {
    let state = planned();
    state = reducer(state, {
      type: "reminders",
      value: { ...state.reminders, paused: true },
    });
    expect(reminderPreview(state).kind).toBe("idle");
    state = reducer(state, {
      type: "reminders",
      value: { ...state.reminders, paused: false },
    });
    expect(reminderPreview(state).kind).toBe("ready");
    state = reducer(state, { type: "deleteStep", id: state.activeId });
    expect(reminderPreview(state).kind).toBe("idle");
  });

  it("rechecks permission for a memory-derived target at preview time", () => {
    let state = planned();
    state = reducer(state, {
      type: "memoryAdd",
      text: "Fictional reading preference",
      source: "Approved preference",
    });
    const linked = { ...state.steps[0], sourceMemoryId: state.memories[0].id };
    state.steps = [linked];
    expect(reminderPreview(state).kind).toBe("ready");
    expect(reminderPreview({ ...state, temporary: true }).kind).toBe("idle");
    expect(reminderPreview({ ...state, memoryConsent: false }).kind).toBe(
      "idle",
    );
    state = reducer(state, { type: "memoryDelete", id: state.memories[0].id });
    expect(reminderPreview(state).kind).toBe("idle");
  });
});

describe("virtual clock", () => {
  it("advances deterministically without product timers", () => {
    expect(advanceClock("2026-10-25T12:00:00.000Z", 24)).toBe(
      "2026-10-26T12:00:00.000Z",
    );
    expect(advanceClock("bad", 24)).toBeNull();
    expect(advanceClock("2026-10-25T12:00:00.000Z", Number.NaN)).toBeNull();
  });
});

describe("weekly plan handoffs", () => {
  it("shrinks only on approval and preserves the original report", () => {
    let state = planned();
    const id = state.activeId;
    state = reducer(state, {
      type: "report",
      id,
      outcome: "Partly",
      barrier: "Too much",
      experience: "Read a line",
    });
    const result = reviewActions(state.steps[0], "shrink", "Read one line");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changed = result.actions.reduce(reducer, state);
    expect(changed.steps[0].title).toBe("Read one line");
    expect(changed.steps[0].version).toBe(2);
    expect(changed.steps[0].reports[0]).toMatchObject({
      title: "Read one page",
      prediction: "It may be hard",
      outcome: "Partly",
    });
  });

  it("rejects an empty adjustment and pauses old follow-up for switch/support", () => {
    const state = planned();
    expect(reviewActions(state.steps[0], "shrink", "   ").ok).toBe(false);
    for (const choice of ["switch", "support"] as const) {
      const result = reviewActions(state.steps[0], choice, "");
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const changed = result.actions.reduce(reducer, state);
      expect(changed.steps[0].paused).toBe(true);
      expect(reminderPreview(changed).kind).toBe("idle");
      expect(result.route).toBe(choice === "switch" ? "/steps/new" : "/help");
    }
  });

  it("continues a selected plan and explicitly resumes a paused routine", () => {
    const state = planned();
    const step = { ...state.steps[0], paused: true, routine: true };
    const result = reviewActions(step, "continue", "");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changed = result.actions.reduce(reducer, { ...state, steps: [step] });
    expect(changed.steps[0].paused).toBe(false);
    expect(changed.activeId).toBe(step.id);
  });
});
