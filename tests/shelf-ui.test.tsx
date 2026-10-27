import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shelf } from "@/features/shelf/shelf";
import { refreshShelf } from "@/server/actions/shelf";

vi.mock("@/server/actions/shelf", () => ({
  refreshShelf: vi.fn(),
  readShelf: vi.fn(),
  shelfFeedback: vi.fn(),
  undoShelf: vi.fn(),
}));
const pick = {
  id: "test",
  title: "Ideas for low mood",
  url: "https://www.nhs.uk/mental-health/",
  host: "www.nhs.uk",
  sourceName: "NHS",
  why: "You can read about small changes for your day.",
};
const empty = {
  current: [],
  saved: [],
  searchEnabled: true,
  refreshNeeded: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("Shelf fallbacks", () => {
  it("restores Undo only for its owner after the Shelf remounts", async () => {
    sessionStorage.setItem(
      "koe-shelf-undo:owner-a",
      JSON.stringify({
        token: "sealed-token",
        message: "Saved to your Shelf.",
      }),
    );
    const { rerender } = render(
      <Shelf key="owner-b" ownerId="owner-b" initial={empty} />,
    );
    await Promise.resolve();
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Saved to your Shelf.")).not.toBeInTheDocument();
    rerender(<Shelf key="owner-a" ownerId="owner-a" initial={empty} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Undo" })).toBeVisible(),
    );
    expect(screen.getByText("Saved to your Shelf.")).toBeVisible();
  });
  it("keeps saved reads available when search is off, without searching", () => {
    render(
      <Shelf
        ownerId="viewer"
        initial={{ ...empty, saved: [pick], searchEnabled: false }}
      />,
    );
    expect(
      screen.getByText("Search is off for now. Your saved picks stay here."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Open Ideas for low mood/ }),
    ).toBeVisible();
    expect(refreshShelf).not.toHaveBeenCalled();
  });

  it("keeps saved reads during a failed refresh and sends one request during effect replay", async () => {
    vi.mocked(refreshShelf).mockResolvedValue({
      ok: false,
      count: 0,
      unavailable: true,
      shelf: { ...empty, saved: [pick] },
    });
    render(
      <StrictMode>
        <Shelf
          ownerId="viewer"
          initial={{ ...empty, saved: [pick], refreshNeeded: true }}
        />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        screen.getByText("Search is unavailable. Check back later."),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole("link", { name: /Open Ideas for low mood/ }),
    ).toBeVisible();
    expect(refreshShelf).toHaveBeenCalledTimes(1);
  });

  it("says no picks are shown when safety checks leave Saved empty", () => {
    render(<Shelf ownerId="viewer" initial={empty} />);
    expect(screen.getByText(/No saved picks to show/)).toBeVisible();
    expect(screen.getByRole("link", { name: /^Talk$/ })).toHaveAttribute(
      "href",
      "/talk",
    );
  });

  it("announces an empty search result without claiming picks were found", async () => {
    vi.mocked(refreshShelf).mockResolvedValue({
      ok: true,
      count: 0,
      shelf: empty,
    });
    render(
      <Shelf ownerId="viewer" initial={{ ...empty, refreshNeeded: true }} />,
    );
    await waitFor(() =>
      expect(
        screen.getByText("No new picks this week. Check back later."),
      ).toBeVisible(),
    );
    expect(screen.queryByText("Your picks are ready.")).not.toBeInTheDocument();
  });
});
