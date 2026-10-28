import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ privacy: vi.fn() }));
vi.mock("@/server/actions/settings", () => ({
  setPrivacy: actions.privacy,
  removeMemory: vi.fn(),
  saveMemory: vi.fn(),
  toggleMemoryUse: vi.fn(),
}));
vi.mock("@/features/safety/safety-check", () => ({ SafetyCheck: () => null }));
import { MemoryCards } from "@/features/settings/memory";
describe("memory consent", () => {
  it("shows the new choice immediately, disables repeat taps, and reverts with an error on failure", async () => {
    let reject!: (reason: Error) => void;
    actions.privacy.mockImplementation(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    render(<MemoryCards cards={[]} memoryOn region="SG" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Memory is on/ }));
    expect(
      screen.getByRole("checkbox", { name: /Memory is off/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Memory is off/ }),
    ).toBeDisabled();
    await act(async () => reject(new Error("offline")));
    expect(
      screen.getByRole("checkbox", { name: /Memory is on/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Memory is on/ }),
    ).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your memory choice could not be confirmed. Reload to check it.",
    );
    expect(actions.privacy).toHaveBeenCalledWith({ memoryOn: false });
  });
});
