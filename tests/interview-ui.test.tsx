import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openingTurn, confirmingTurn, fallbackTurn } from "@/domain/interview";
import { fallbackPieces } from "@/domain/piece-rules";
import { capturedThingSchema } from "@/domain/week";
import {
  interviewKey,
  readInterviewDraft,
  writeInterviewDraft,
} from "@/features/intake/interview-draft";
const mocks = vi.hoisted(() => ({
  startInterview: vi.fn(),
  advanceInterview: vi.fn(),
  saveInterviewWeek: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/server/actions/interview", () => mocks);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/features/safety/safety-check", () => ({
  SafetyCheck: () => <h1>Safety check</h1>,
}));
import { WorkInterview } from "@/features/intake/interview";
const thing = capturedThingSchema.parse({ what: "Update the CV" });
const draft = { items: [{ captured: thing, pieces: fallbackPieces(thing) }] };
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  mocks.startInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "opening",
    turn: openingTurn(),
  });
});
afterEach(cleanup);
it("feeds the weekly intake answer into the interview without another opening question", async () => {
  mocks.advanceInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "followup",
    turn: fallbackTurn(thing, 0),
  });
  render(
    <WorkInterview
      owner="a"
      region="SG"
      seed="Update the CV"
      onReady={vi.fn()}
      onSkip={vi.fn()}
    />,
  );
  await screen.findByRole("heading", { name: "Where does it get stuck?" });
  expect(mocks.advanceInterview).toHaveBeenCalledWith({
    token: "opening",
    text: "Update the CV",
    intent: "answer",
  });
  expect(
    screen.getByRole("button", { name: "That's enough for now" }),
  ).toBeVisible();
});
it("keeps the token and typed answer when its safety check is unavailable", async () => {
  mocks.advanceInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    unavailable: true,
    turn: null,
  });
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.change(await screen.findByLabelText("Your answer"), {
    target: { value: "Update the CV" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  await screen.findByRole("alert");
  expect(readInterviewDraft("a", "return")).toMatchObject({
    token: "opening",
    answer: "Update the CV",
  });
  expect(screen.getByLabelText("Your answer")).toHaveValue("Update the CV");
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("uses canonical confirm intents and clears the draft before successful navigation", async () => {
  writeInterviewDraft("a", "return", {
    token: "confirm",
    turn: confirmingTurn(),
    messages: [],
    answer: "",
  });
  mocks.advanceInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "proposal",
    turn: null,
    draft,
  });
  mocks.saveInterviewWeek.mockResolvedValue({
    ok: true,
    safety: "none",
    turn: null,
    week: { id: "saved" },
  });
  mocks.replace.mockImplementation(() =>
    expect(sessionStorage.getItem(interviewKey("a", "return"))).toBeNull(),
  );
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.click(await screen.findByRole("button", { name: "Break it down" }));
  fireEvent.click(screen.getByRole("button", { name: "Show the pieces" }));
  await screen.findByRole("heading", { name: "Your week, in smaller pieces" });
  expect(mocks.advanceInterview).toHaveBeenCalledWith({
    token: "confirm",
    intent: "propose",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save this week" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/today"));
});
it("retains proposed words on an uncertain save and offers expired-token recovery", async () => {
  writeInterviewDraft("a", "return", {
    token: "proposal",
    turn: null,
    draft,
    messages: [],
    answer: "",
  });
  mocks.saveInterviewWeek.mockRejectedValue(new Error("offline"));
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Save this week" }),
  );
  await screen.findByRole("alert");
  expect(readInterviewDraft("a", "return")?.draft).toEqual(draft);
  mocks.saveInterviewWeek.mockResolvedValue({
    ok: false,
    error: "This interview changed. Open it again before continuing.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save this week" }));
  await screen.findByRole("button", { name: "Open interview again" });
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("does not restore another owner's interview or persist unsafe draft words", () => {
  writeInterviewDraft("a", "return", {
    token: "proposal",
    turn: null,
    draft,
    messages: [],
    answer: "I want to end it all",
  });
  expect(readInterviewDraft("b", "return")).toBeNull();
  expect(readInterviewDraft("a", "return")?.answer).toBe("");
  expect(sessionStorage.getItem(interviewKey("a", "return"))).not.toContain(
    "end it all",
  );
});
it("rejects unchecked current questions and options in stored drafts", () => {
  sessionStorage.setItem(
    interviewKey("a", "return"),
    JSON.stringify({
      token: "edited",
      turn: { ...openingTurn(), message: "I want to end it all" },
      messages: [],
      answer: "",
    }),
  );
  expect(readInterviewDraft("a", "return")).toBeNull();
  sessionStorage.setItem(
    interviewKey("a", "return"),
    JSON.stringify({
      token: "edited",
      turn: {
        ...confirmingTurn(),
        ask: {
          kind: "single",
          allowOther: false,
          options: [{ id: "propose", label: "Call 988" }],
        },
      },
      messages: [],
      answer: "",
    }),
  );
  expect(readInterviewDraft("a", "return")).toBeNull();
});
it("keeps the safe typed answer after a confirmed expired-token restart", async () => {
  writeInterviewDraft("a", "return", {
    token: "expired",
    turn: openingTurn(),
    messages: [],
    answer: "The opening paragraph",
  });
  mocks.advanceInterview.mockResolvedValue({
    ok: false,
    error: "This interview changed. Open it again before continuing.",
  });
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Open interview again" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Yes, open interview again",
    }),
  );
  await waitFor(() => expect(mocks.startInterview).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByLabelText("Your answer")).toHaveValue(
      "The opening paragraph",
    ),
  );
});
