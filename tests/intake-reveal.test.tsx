import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { intakeModel, type Reveal } from "@/domain/intake";
import { fallbackPlan } from "@/domain/plan-menu";
import { blankDraft, saveDraft } from "@/features/intake/draft-store";
const mocks = vi.hoisted(() => ({ startMyDay: vi.fn(), replace: vi.fn() }));
vi.mock("@/server/actions/intake", () => ({ startMyDay: mocks.startMyDay }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/features/safety/safety-check", () => ({
  SafetyCheck: () => <h1>Safety check</h1>,
}));
import { RevealScreen } from "@/features/intake/reveal";
const key = "koe.intake.draft.v1";
const model = intakeModel.parse({
  goals: ["sleep"],
  puttingOff: "Open the CV",
});
const reveal: Reveal = {
  model,
  summary: "You want sleep to feel steadier.",
  memories: [],
  items: fallbackPlan(model),
  eatingConcern: false,
  source: "fallback",
  reminderRules: { quietStart: 1320, quietEnd: 480, nowMinute: 600 },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  sessionStorage.clear();
  saveDraft({
    version: 2,
    stage: 4,
    draft: { ...blankDraft(), goals: ["sleep"], puttingOff: "Open the CV" },
  });
});
afterEach(cleanup);
function start() {
  render(<RevealScreen reveal={reveal} region="SG" publicKey={null} hour12 />);
  fireEvent.click(screen.getByRole("button", { name: "Start my day" }));
}
it("clears the completed draft before opening Today", async () => {
  mocks.startMyDay.mockResolvedValue({ ok: true });
  mocks.replace.mockImplementation(() =>
    expect(sessionStorage.getItem(key)).toBeNull(),
  );
  start();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/today"));
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("keeps the draft and stays on reveal when saving fails", async () => {
  mocks.startMyDay.mockResolvedValue({
    ok: false,
    errors: { form: "Try again." },
  });
  start();
  await screen.findByRole("alert");
  expect(sessionStorage.getItem(key)).toContain("Open the CV");
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("keeps the draft on a network failure and offers recovery", async () => {
  mocks.startMyDay.mockRejectedValue(new Error("offline"));
  start();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your day couldn't be confirmed. Try Start my day again.",
  );
  expect(sessionStorage.getItem(key)).toContain("Open the CV");
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("keeps the draft when risky reveal edits open safety", async () => {
  mocks.startMyDay.mockResolvedValue({ ok: true, safety: "concern" });
  start();
  await screen.findByRole("heading", { name: "Safety check" });
  expect(sessionStorage.getItem(key)).toContain("Open the CV");
  expect(mocks.replace).not.toHaveBeenCalled();
});
