import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openingTurn, confirmingTurn, fallbackTurn } from "@/domain/interview";
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
const thing = capturedThingSchema.parse({
  what: "Update the CV",
  title: "Update the CV",
});
const draft = { items: [{ captured: thing }] };
const multiTurn = {
  ...openingTurn(),
  message: "Which parts need your attention?",
  ask: {
    kind: "multi" as const,
    allowOther: true,
    options: [
      { id: "opening", label: "Opening paragraph" },
      { id: "dates", label: "Work dates" },
    ],
  },
};
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
it("keeps every multi-choice pick and Other across reload, then sends them all", async () => {
  mocks.startInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "multi",
    turn: multiTurn,
  });
  mocks.advanceInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "next",
    turn: confirmingTurn(),
  });
  const view = render(<WorkInterview owner="a" region="SG" />);
  const dates = await screen.findByRole("button", { name: "Work dates" });
  await waitFor(() => expect(dates).toBeEnabled());
  fireEvent.click(dates);
  fireEvent.click(screen.getByRole("button", { name: /Something else/ }));
  fireEvent.change(screen.getByLabelText("Your words"), {
    target: { value: "Contact details" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Opening paragraph" }));
  expect(screen.getByLabelText("Your words")).toHaveValue("Contact details");
  expect(readInterviewDraft("a", "return")).toMatchObject({
    selected: ["dates", "opening"],
    answer: "Contact details",
  });
  expect(readInterviewDraft("b", "return")).toBeNull();
  view.unmount();
  render(<WorkInterview owner="a" region="SG" />);
  expect(
    await screen.findByRole("button", { name: "Opening paragraph" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Work dates" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByLabelText("Your words")).toHaveValue("Contact details");
  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  await screen.findByRole("heading", { name: confirmingTurn().message });
  expect(mocks.advanceInterview).toHaveBeenCalledWith({
    token: "multi",
    intent: "answer",
    text: "Opening paragraph; Work dates; Contact details",
  });
  expect(readInterviewDraft("a", "return")?.selected).toEqual([]);
  expect(mocks.startInterview).toHaveBeenCalledTimes(1);
});
it("blocks combined answers over 400 characters without losing words or picks", async () => {
  const prefix = "Opening paragraph; Work dates; ";
  const words = "a".repeat(401 - prefix.length);
  writeInterviewDraft("a", "return", {
    token: "multi",
    turn: multiTurn,
    selected: ["opening", "dates"],
    messages: [],
    answer: words,
  });
  mocks.advanceInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "next",
    turn: confirmingTurn(),
  });
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Shorten your words or unselect an option.",
  );
  expect(mocks.advanceInterview).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Your words")).toHaveValue(words);
  expect(readInterviewDraft("a", "return")).toMatchObject({
    selected: ["opening", "dates"],
    answer: words,
  });
  fireEvent.change(screen.getByLabelText("Your words"), {
    target: { value: words.slice(1) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  await waitFor(() =>
    expect(mocks.advanceInterview).toHaveBeenCalledWith({
      token: "multi",
      intent: "answer",
      text: prefix + words.slice(1),
    }),
  );
});
it("keeps single-choice answers exclusive when switching to and from Other", async () => {
  writeInterviewDraft("a", "return", {
    token: "single",
    turn: { ...multiTurn, ask: { ...multiTurn.ask, kind: "single" } },
    messages: [],
    answer: "Contact details",
  });
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Opening paragraph" }),
  );
  expect(screen.getByLabelText("Your words")).toHaveValue("");
  expect(readInterviewDraft("a", "return")?.selected).toEqual(["opening"]);
  fireEvent.change(screen.getByLabelText("Your words"), {
    target: { value: "Contact details" },
  });
  expect(
    screen.getByRole("button", { name: "Opening paragraph" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(readInterviewDraft("a", "return")?.selected).toEqual([]);
});
it("restores old drafts without picks and rejects selections outside the current ask", () => {
  const value = {
    token: "old",
    turn: multiTurn,
    messages: [],
    answer: "Contact details",
  };
  sessionStorage.setItem(interviewKey("a", "return"), JSON.stringify(value));
  expect(readInterviewDraft("a", "return")).toMatchObject({
    ...value,
    selected: [],
  });
  for (const selected of [
    ["foreign"],
    ["opening", "opening"],
    ["opening", 2],
  ]) {
    sessionStorage.setItem(
      interviewKey("a", "return"),
      JSON.stringify({ ...value, selected }),
    );
    expect(readInterviewDraft("a", "return")).toBeNull();
  }
  sessionStorage.setItem(
    interviewKey("a", "return"),
    JSON.stringify({
      ...value,
      turn: openingTurn(),
      selected: ["opening"],
    }),
  );
  expect(readInterviewDraft("a", "return")).toBeNull();
  sessionStorage.setItem(
    interviewKey("a", "return"),
    JSON.stringify({
      ...value,
      turn: confirmingTurn(),
      selected: ["finish", "add"],
    }),
  );
  expect(readInterviewDraft("a", "return")).toBeNull();
});
it("preserves selected labels and Other as words after a confirmed restart", async () => {
  writeInterviewDraft("a", "return", {
    token: "expired",
    turn: multiTurn,
    selected: ["opening", "dates"],
    messages: [],
    answer: "Contact details",
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
    screen.getByRole("button", { name: "Yes, open interview again" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Your answer")).toHaveValue(
      "Opening paragraph; Work dates; Contact details",
    ),
  );
});
it("keeps an over-limit recovery answer editable instead of clearing it", async () => {
  const prefix = "Opening paragraph; Work dates; ";
  const words = "a".repeat(400 - prefix.length);
  writeInterviewDraft("a", "return", {
    token: "expired",
    turn: multiTurn,
    selected: ["opening", "dates"],
    messages: [],
    answer: words,
  });
  mocks.advanceInterview.mockResolvedValue({
    ok: false,
    error: "This interview changed. Open it again before continuing.",
  });
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
  await screen.findByRole("button", { name: "Open interview again" });
  fireEvent.change(screen.getByLabelText("Your words"), {
    target: { value: words + "a" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open interview again" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Yes, open interview again" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("400 characters");
  expect(mocks.startInterview).not.toHaveBeenCalled();
  expect(readInterviewDraft("a", "return")).toMatchObject({
    answer: words + "a",
    selected: ["opening", "dates"],
  });
  fireEvent.change(screen.getByLabelText("Your words"), {
    target: { value: words },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open interview again" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Yes, open interview again" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Your answer")).toHaveValue(prefix + words),
  );
});
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
  await screen.findByRole("heading", {
    name: "When does it need to be done?",
  });
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
    messages: [{ id: "a-0", role: "user", text: "Update the CV" }],
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
  fireEvent.click(
    await screen.findByRole("button", { name: "That's enough for now" }),
  );
  await screen.findByRole("heading", { name: "This week" });
  expect(mocks.advanceInterview).toHaveBeenCalledWith({
    token: "confirm",
    intent: "finish",
  });
  expect(screen.queryByText(/pieces/i)).toBeNull();
  expect(screen.getByRole("heading", { name: "Update the CV" })).toBeVisible();
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
          options: [{ id: "finish", label: "Call 988" }],
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
it("opens with no info text and a quiet finish under the answer", async () => {
  mocks.advanceInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "done",
    turn: null,
  });
  render(<WorkInterview owner="a" region="SG" />);
  await screen.findByRole("heading", {
    name: "What's one thing you'd like to get done this week?",
  });
  expect(screen.getByPlaceholderText("e.g. Update my CV")).toBeVisible();
  expect(screen.queryByText(/Koe uses your words/)).toBeNull();
  expect(screen.queryByRole("link", { name: "Leave for Today" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "That's enough for now" }),
  );
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/today"));
  expect(mocks.advanceInterview).not.toHaveBeenCalled();
});
it("finishes with what was named from the quiet button on a later turn", async () => {
  writeInterviewDraft("a", "return", {
    token: "followup",
    turn: fallbackTurn(thing, 0),
    messages: [{ id: "a-0", role: "user", text: "Update the CV" }],
    answer: "",
  });
  mocks.advanceInterview.mockResolvedValue({
    ok: true,
    safety: "none",
    token: "proposal",
    turn: null,
    draft,
  });
  render(<WorkInterview owner="a" region="SG" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "That's enough for now" }),
  );
  await screen.findByRole("heading", { name: "Update the CV" });
  expect(mocks.advanceInterview).toHaveBeenCalledWith({
    token: "followup",
    intent: "finish",
  });
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("skips to the rule-based day from the hard-day choice without a server call", async () => {
  const onSkip = vi.fn().mockResolvedValue(undefined);
  writeInterviewDraft("a", "intro", {
    token: "hard",
    turn: {
      message: "Heavy day. Today can be really small.",
      phase: "confirming",
      captured: {},
      ask: {
        kind: "single",
        allowOther: false,
        options: [{ id: "skip", label: "No plan today" }],
      },
    },
    messages: [],
    answer: "",
  });
  render(
    <WorkInterview owner="a" region="SG" onReady={vi.fn()} onSkip={onSkip} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "No plan today" }));
  await waitFor(() => expect(onSkip).toHaveBeenCalled());
  expect(mocks.advanceInterview).not.toHaveBeenCalled();
});
it("renames, removes and undoes This week things before saving", async () => {
  const two = {
    items: [
      { proposalId: crypto.randomUUID(), captured: thing },
      {
        proposalId: crypto.randomUUID(),
        captured: { what: "Essay", when: "Friday", title: "Finish the essay" },
      },
    ],
  };
  writeInterviewDraft("a", "return", {
    token: "proposal",
    turn: null,
    draft: two,
    messages: [],
    answer: "",
  });
  mocks.saveInterviewWeek.mockResolvedValue({
    ok: true,
    safety: "none",
    turn: null,
    week: { id: "saved" },
  });
  render(<WorkInterview owner="a" region="SG" />);
  await screen.findByRole("heading", { name: "Finish the essay" });
  expect(screen.getByText("By Friday")).toBeVisible();
  expect(screen.queryByText(/Change the words/)).toBeNull();
  expect(
    screen.getByText("Nothing is saved until you tap Save this week."),
  ).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1]);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Essay conclusion" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("heading", { name: "Essay conclusion" });
  fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
  expect(screen.getByText("Removed.")).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
  expect(screen.getByText("Nothing in This week yet.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save this week" })).toBeDisabled();
  fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[1]);
  expect(screen.queryByText("Nothing in This week yet.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save this week" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/today"));
  expect(mocks.saveInterviewWeek).toHaveBeenCalledWith({
    token: "proposal",
    draft: {
      items: [
        {
          ...two.items[1],
          captured: { ...two.items[1].captured, title: "Essay conclusion" },
        },
      ],
    },
  });
});
