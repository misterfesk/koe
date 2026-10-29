import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  submitWeekReview: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/server/actions/week", () => ({
  submitWeekReview: mocks.submitWeekReview,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/features/safety/safety-check", () => ({
  SafetyCheck: () => <h1>Safety check</h1>,
}));
import { reviewHiddenKey, WeekReview } from "@/features/today/week-review";

const review = {
  weekId: "w1",
  version: 2,
  things: [
    { id: "a", title: "Update my CV", when: "Friday", done: true, partly: 0 },
    {
      id: "b",
      title: "Email the landlord",
      when: "",
      done: false,
      partly: 2,
    },
    { id: "c", title: "Repot the plants", when: "", done: false, partly: 0 },
  ],
};
const view = () =>
  render(<WeekReview owner="u1" today="2026-10-28" review={review} />);
const group = (title: string) => screen.getByRole("group", { name: title });
const pick = (title: string, label: string) =>
  fireEvent.click(within(group(title)).getByRole("button", { name: label }));

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});
afterEach(cleanup);

it("asks about each open thing and shows what moved", () => {
  view();
  expect(screen.getByRole("heading", { name: "Last week" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "Update my CV" })).toBeNull();
  expect(screen.getByText("Done")).toBeVisible();
  expect(screen.getByText("Moved forward twice")).toBeVisible();
  for (const title of ["Email the landlord", "Repot the plants"])
    expect(
      within(group(title))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Keep it for this week", "Change it", "Let it go"]);
  expect(screen.queryByText(/Something else/)).toBeNull();
});

it("names the button for the result once every open thing has a choice", () => {
  view();
  const start = screen.getByRole("button", { name: "Start this week" });
  expect(start).toBeDisabled();
  pick("Email the landlord", "Let it go");
  expect(start).toBeDisabled();
  pick("Repot the plants", "Let it go");
  expect(screen.getByRole("button", { name: "Close last week" })).toBeEnabled();
  pick("Repot the plants", "Keep it for this week");
  expect(screen.getByRole("button", { name: "Start this week" })).toBeEnabled();
});

it("offers Close last week when everything was done", () => {
  render(
    <WeekReview
      owner="u1"
      today="2026-10-28"
      review={{ ...review, things: [review.things[0]] }}
    />,
  );
  expect(screen.getByRole("button", { name: "Close last week" })).toBeEnabled();
});

it("edits in place on Change it, checks the words and cancels back", async () => {
  view();
  pick("Repot the plants", "Change it");
  const title = screen.getByLabelText("What it is");
  expect(title).toHaveValue("Repot the plants");
  expect(screen.getByLabelText("When it needs to be done")).toHaveValue("");
  pick("Email the landlord", "Keep it for this week");
  fireEvent.change(title, { target: { value: " " } });
  fireEvent.click(screen.getByRole("button", { name: "Start this week" }));
  expect(screen.getByText("Give it a few words.")).toBeVisible();
  fireEvent.change(title, { target: { value: "Lose weight" } });
  fireEvent.click(screen.getByRole("button", { name: "Start this week" }));
  expect(screen.getByText("Try different words for this one.")).toBeVisible();
  fireEvent.change(title, { target: { value: "Plan the trip with us" } });
  fireEvent.click(screen.getByRole("button", { name: "Start this week" }));
  expect(screen.getByText("Try it without we, us or together.")).toBeVisible();
  expect(mocks.submitWeekReview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("What it is")).toBeNull();
  expect(
    within(group("Repot the plants")).getByRole("button", {
      name: "Change it",
    }),
  ).toHaveAttribute("aria-pressed", "false");
});

it("hides for the day on Not now", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(screen.queryByRole("heading", { name: "Last week" })).toBeNull();
  expect(localStorage.getItem(reviewHiddenKey("u1", "2026-10-28"))).toBe("1");
  cleanup();
  render(<WeekReview owner="u1" today="2026-10-29" review={review} />);
  expect(screen.getByRole("heading", { name: "Last week" })).toBeVisible();
});

it("saves, shows the set line with the add link, and reloads the page data", async () => {
  mocks.submitWeekReview.mockResolvedValue({
    ok: true,
    week: { id: "w2", items: [{ id: "x" }] },
  });
  view();
  pick("Email the landlord", "Keep it for this week");
  pick("Repot the plants", "Change it");
  fireEvent.change(screen.getByLabelText("When it needs to be done"), {
    target: { value: "Sunday" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start this week" }));
  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent("This week is set.");
  await waitFor(() => expect(status).toHaveFocus());
  expect(
    screen.getByRole("link", { name: /Add something for this week/ }),
  ).toHaveAttribute("href", "/intake#interview");
  expect(mocks.refresh).toHaveBeenCalled();
  const input = mocks.submitWeekReview.mock.calls[0][0];
  expect(input).toMatchObject({
    weekId: "w1",
    expectedVersion: 2,
    decisions: [
      { itemId: "b", choice: "keep" },
      {
        itemId: "c",
        choice: "change",
        title: "Repot the plants",
        when: "Sunday",
      },
    ],
  });
  expect(input.createId).toMatch(/^[0-9a-f-]{36}$/);
});

it("keeps the set line once the page drops the review, and shows server errors", async () => {
  mocks.submitWeekReview.mockResolvedValueOnce({
    ok: false,
    error: "This week changed. Open it again before saving.",
  });
  const { rerender } = view();
  pick("Email the landlord", "Let it go");
  pick("Repot the plants", "Let it go");
  fireEvent.click(screen.getByRole("button", { name: "Close last week" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This week changed. Open it again before saving.",
  );
  mocks.submitWeekReview.mockResolvedValueOnce({ ok: true, week: null });
  fireEvent.click(screen.getByRole("button", { name: "Close last week" }));
  await screen.findByRole("status");
  rerender(<WeekReview owner="u1" today="2026-10-28" review={null} />);
  expect(screen.getByRole("status")).toHaveTextContent("This week is set.");
  expect(
    screen.getByRole("link", { name: /Add something for this week/ }),
  ).toBeVisible();
});

it("sends risk words to the server and shows the safety check", async () => {
  mocks.submitWeekReview.mockResolvedValue({ ok: false, safety: true });
  view();
  pick("Email the landlord", "Let it go");
  pick("Repot the plants", "Change it");
  fireEvent.change(screen.getByLabelText("What it is"), {
    target: { value: "I want to kill myself" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start this week" }));
  expect(
    await screen.findByRole("heading", { name: "Safety check" }),
  ).toBeVisible();
  expect(mocks.submitWeekReview).toHaveBeenCalled();
});
