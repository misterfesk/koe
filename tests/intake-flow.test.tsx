import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { blankDraft, saveDraft } from "@/features/intake/draft-store";
const actions = vi.hoisted(() => ({
  checkIntakeText: vi.fn(),
  buildReveal: vi.fn(),
}));
vi.mock("@/server/actions/intake", () => actions);
vi.mock("@/features/intake/reveal", () => ({
  RevealScreen: () => <h1>Plan ready</h1>,
}));
vi.mock("@/features/intake/interview", () => ({
  WorkInterview: ({ seed, onSkip }: { seed: string; onSkip: () => void }) => (
    <>
      <h1>Weekly interview</h1>
      <p>{seed}</p>
      <button onClick={onSkip}>Enough for now</button>
    </>
  ),
}));
vi.mock("@/features/safety/safety-check", () => ({
  SafetyCheck: ({ onResume }: { onResume: () => void }) => (
    <button onClick={onResume}>Resume safely</button>
  ),
}));
import { IntakeFlow } from "@/features/intake/intake-flow";
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  actions.checkIntakeText.mockResolvedValue({ safety: "none" });
});
afterEach(cleanup);
function show(stage: 1 | 2 | 4, draft = blankDraft()) {
  saveDraft({ version: 2, stage, draft });
  render(<IntakeFlow region="SG" publicKey={null} hour12 />);
}
it("recovers a failed text action without losing the answer", async () => {
  show(4, { ...blankDraft(), puttingOff: "Update my CV" });
  actions.checkIntakeText.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(await screen.findByRole("button", { name: "Done" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Try again"),
  );
  expect(screen.getByLabelText("Your answer")).toHaveValue("Update my CV");
  actions.buildReveal.mockResolvedValue({
    ok: true,
    safety: "none",
    reveal: { summary: "Ready" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await screen.findByRole("heading", { name: "Plan ready" });
  expect(actions.buildReveal).toHaveBeenCalledWith(
    expect.objectContaining({ puttingOff: "Update my CV" }),
    false,
  );
});
it("screens day Other and drops it before safety resumes", async () => {
  show(2);
  const group = await screen.findByRole("group");
  const { within } = await import("@testing-library/react");
  fireEvent.click(
    within(group).getByRole("button", { name: /Something else/ }),
  );
  fireEvent.change(within(group).getByLabelText("Your words"), {
    target: { value: "I want to end it all" },
  });
  actions.checkIntakeText.mockResolvedValue({ safety: "high" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByRole("button", { name: "Resume safely" }));
  await screen.findByRole("heading", { name: "What used to lift you?" });
  expect(actions.checkIntakeText).toHaveBeenCalledWith([
    "I want to end it all",
  ]);
  expect(sessionStorage.getItem("koe.intake.draft.v1")).not.toContain(
    "end it all",
  );
});
it("resumes a flagged weekly answer into synthesis without unsafe words", async () => {
  show(4);
  fireEvent.change(await screen.findByLabelText("Your answer"), {
    target: { value: "I want to end it all" },
  });
  actions.checkIntakeText.mockResolvedValue({ safety: "high" });
  actions.buildReveal.mockResolvedValue({
    ok: true,
    safety: "none",
    reveal: { summary: "Ready" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(await screen.findByRole("button", { name: "Resume safely" }));
  await screen.findByRole("heading", { name: "Plan ready" });
  expect(actions.buildReveal.mock.calls[0][0].puttingOff).toBeUndefined();
});
