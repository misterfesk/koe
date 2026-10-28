import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/intake/intake-flow", () => ({
  IntakeFlow: () => <h1>Active intake</h1>,
}));
vi.mock("@/features/intake/interview", () => ({
  WorkInterview: () => <h1>Weekly interview</h1>,
}));
import { IntakeEntry } from "@/features/intake/intake-entry";
const props = {
  owner: "a",
  hasIntro: false,
  week: null,
  region: "SG",
  publicKey: null,
  hour12: true,
};
beforeEach(() => {
  router.replace.mockReset();
  window.history.replaceState({}, "", "/intake");
});
afterEach(cleanup);
it("resolves the weekly fragment for someone who already finished the intro", async () => {
  window.history.replaceState({}, "", "/intake#interview");
  render(<IntakeEntry {...props} hasIntro />);
  await screen.findByRole("heading", { name: "Weekly interview" });
  expect(router.replace).not.toHaveBeenCalled();
});
it("redirects a completed person entering the plain intake route", async () => {
  render(<IntakeEntry {...props} hasIntro />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/today"));
});
it("does not let save revalidation navigate before the caller clears its draft", async () => {
  const { rerender } = render(<IntakeEntry {...props} />);
  await screen.findByRole("heading", { name: "Active intake" });
  rerender(<IntakeEntry {...props} hasIntro />);
  expect(screen.getByRole("heading", { name: "Active intake" })).toBeVisible();
  expect(router.replace).not.toHaveBeenCalled();
});
