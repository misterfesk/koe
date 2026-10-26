import { render, screen, fireEvent } from "@testing-library/react";
import { vi, it, expect } from "vitest";
import { SessionProvider } from "../components/session";
import { Planner } from "../features/steps/planner";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
it("keeps invalid input and exposes a field error", async () => {
  render(
    <SessionProvider>
      <Planner />
    </SessionProvider>,
  );
  fireEvent.change(screen.getByLabelText("Your step"), {
    target: { value: "   " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose this step" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Give your step");
  expect(screen.getByLabelText("Your step")).toHaveValue("   ");
  expect(screen.getByLabelText("Your step")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});
