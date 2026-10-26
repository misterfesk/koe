import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { initialState, reducer } from "../domain/state";
const { session } = vi.hoisted(() => ({
  session: { state: null as unknown, dispatch: vi.fn() },
}));
vi.mock("../components/session", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { Today } from "../features/steps/today";
it("does not attribute an earlier report to an untried adjustment", () => {
  let s = reducer(initialState(), {
    type: "choose",
    title: "Read a page",
    area: "Enjoyment",
    prediction: "Too much",
  });
  const id = s.activeId;
  s = reducer(s, {
    type: "report",
    id,
    outcome: "Partly",
    barrier: "",
    experience: "One line",
  });
  s = reducer(s, { type: "propose", id, title: "Read a line" });
  s = reducer(s, { type: "acceptAdjustment", id });
  session.state = s;
  render(<Today />);
  expect(screen.queryByText(/You reported: Partly/)).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "A step that's yours",
  );
});
