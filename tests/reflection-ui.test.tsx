import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SessionProvider } from "../components/session";
import { MemoryPage } from "../features/memory/memory";
import { Conversation } from "../features/conversation/conversation";
import { JournalPage } from "../features/journal/journal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

it("keeps a blank memory draft with an accessible error and blocks approval in temporary mode", async () => {
  render(
    <SessionProvider>
      <MemoryPage />
    </SessionProvider>,
  );
  fireEvent.change(screen.getByLabelText("New memory card"), {
    target: { value: "   " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve new memory" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Write the card");
  expect(screen.getByLabelText("New memory card")).toHaveValue("   ");
  expect(screen.getByLabelText("New memory card")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  fireEvent.change(screen.getByLabelText("New memory card"), {
    target: { value: "A fictional preference" },
  });
  fireEvent.click(
    screen.getByLabelText("Temporary mode: do not create or retrieve memory"),
  );
  expect(
    screen.getByRole("button", { name: "Approve new memory" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("heading", { name: "A fictional preference" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByLabelText("Temporary mode: do not create or retrieve memory"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve new memory" }));
  expect(
    screen.getByRole("heading", { name: "A fictional preference" }),
  ).toBeVisible();
});

it("asks permission before showing an idea and keeps words when the script is declined", () => {
  render(
    <SessionProvider>
      <Conversation />
    </SessionProvider>,
  );
  expect(
    screen.getByText(
      "Scripted preview. No live AI reads or responds to your words.",
      { exact: true },
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Start the script" }));
  fireEvent.change(screen.getByLabelText("Your fictional words (optional)"), {
    target: { value: "A fictional practical difficulty" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Continue scripted exchange" }),
  );
  expect(
    screen.getByRole("heading", { name: "Would an idea be useful?" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Choose this step" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "No, leave it here" }));
  fireEvent.click(screen.getByRole("button", { name: "Resume the script" }));
  expect(screen.getByLabelText("Your fictional words (optional)")).toHaveValue(
    "A fictional practical difficulty",
  );
});

it("does not turn a double submit into an extra energy-only entry", () => {
  render(
    <SessionProvider>
      <JournalPage />
    </SessionProvider>,
  );
  fireEvent.change(screen.getByLabelText("Energy for this note"), {
    target: { value: "low" },
  });
  fireEvent.change(screen.getByLabelText("Fictional journal note (optional)"), {
    target: { value: "One fictional note" },
  });
  const submit = screen.getByRole("button", { name: "Record energy / note" });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(screen.getAllByText("Reported energy: Low")).toHaveLength(1);
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Fictional journal note (optional)"), {
    target: { value: "A different fictional note" },
  });
  expect(submit).toBeEnabled();
});
