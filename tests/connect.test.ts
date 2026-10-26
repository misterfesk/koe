import { it, expect } from "vitest";
import {
  prepareCareExport,
  contactMessage,
  contactContext,
} from "../domain/connect";
it("exports original notes beside an independently edited factual summary", () => {
  const r = prepareCareExport({
    originalNotes: "Ask about cost",
    editedSummary: "Ask about cost and access",
    inquiryDraft: "Hello",
    questions: "What are next steps?",
    checklist: ["Check cost and access"],
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.originalNotes).toBe("Ask about cost");
    expect(r.data.editedSummary).toBe("Ask about cost and access");
    expect(r.data).not.toHaveProperty("appointment");
  }
});
it("rejects empty copied messages and too-long care data without throwing", () => {
  expect(contactMessage.safeParse("   ").success).toBe(false);
  expect(
    prepareCareExport({
      originalNotes: "a".repeat(3001),
      editedSummary: "",
      inquiryDraft: "",
      questions: "",
      checklist: [],
    }).success,
  ).toBe(false);
});
it("keeps no-reply and declined reports calm", () => {
  expect(contactContext("No reply")).toBe("setback");
  expect(contactContext("Prefer not to say")).toBe("setback");
});
