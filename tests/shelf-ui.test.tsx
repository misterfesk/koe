import { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shelf } from "@/features/shelf/shelf";
import type { ShelfPick } from "@/server/data/shelf";
import { TodayPick } from "@/features/shelf/today-pick";
import { readShelf, refreshShelf, shelfFeedback } from "@/server/actions/shelf";

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
  format: "article" as const,
  cover: { kind: "none" as const },
  forWeek: false,
};
const empty = {
  current: [],
  saved: [],
  searchEnabled: true,
  refreshNeeded: false,
  loading: false,
  weekTopics: [],
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

const video: ShelfPick = {
  ...pick,
  id: "vid",
  title: "Starting small tasks",
  sourceName: "NHS Channel",
  format: "video" as const,
  videoId: "abc123",
  cover: {
    kind: "youtube" as const,
    src: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  },
};
const weekRead: ShelfPick = {
  ...pick,
  id: "wk",
  title: "Work email help",
  forWeek: true,
  weekTopic: "work" as const,
  readMinutes: 4,
};
const read2: ShelfPick = {
  ...pick,
  id: "r2",
  title: "Sleep notes",
  readMinutes: 6,
};
const view = (current: ShelfPick[]) => ({ ...empty, current });

describe("Shelf rows, chips and covers", () => {
  it("hides the chips below two picks", () => {
    render(<Shelf ownerId="v" initial={view([pick])} />);
    expect(
      screen.queryByRole("group", { name: "Filter picks" }),
    ).not.toBeInTheDocument();
  });

  it("hides Videos and Reads chips when none, and shows topic chips", () => {
    render(<Shelf ownerId="v" initial={view([weekRead, read2])} />);
    const group = screen.getByRole("group", { name: "Filter picks" });
    expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(group).queryByRole("button", { name: "Videos" }),
    ).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Reads" })).toBeVisible();
    expect(within(group).getByRole("button", { name: "Work" })).toBeVisible();
  });

  it("orders rows, omits empty ones and filters by topic", () => {
    render(<Shelf ownerId="v" initial={view([read2, video, weekRead])} />);
    const heads = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(heads).toEqual(["For your week", "Videos", "Reads", "Saved"]);
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["For your week", "Saved"]);
    expect(
      screen.queryByRole("heading", { name: "Sleep notes" }),
    ).not.toBeInTheDocument();
  });

  it("shows Nothing here yet and Show all when a filter leaves nothing", async () => {
    vi.mocked(shelfFeedback).mockResolvedValue({ ok: true, undoToken: "t" });
    vi.mocked(readShelf).mockResolvedValue(view([read2]));
    render(<Shelf ownerId="v" initial={view([weekRead, read2])} />);
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    fireEvent.click(screen.getByRole("button", { name: "Not for me" }));
    await waitFor(() =>
      expect(screen.getByText(/Nothing here yet./)).toBeVisible(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("heading", { name: "Sleep notes" })).toBeVisible();
  });

  it("badges videos and reads with minutes, and falls back to a generated cover", () => {
    const { container } = render(
      <Shelf
        ownerId="v"
        initial={view([
          video,
          {
            ...read2,
            cover: { kind: "image" as const, src: "/api/shelf/cover/k" },
          },
        ])}
      />,
    );
    expect(screen.getByText("Video")).toBeVisible();
    expect(screen.getByText("6 min read")).toBeVisible();
    const img = container.querySelector('img[src="/api/shelf/cover/k"]')!;
    fireEvent.error(img);
    expect(container.querySelector('img[src="/api/shelf/cover/k"]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(
      screen.getByRole("link", {
        name: /Watch Starting small tasks on YouTube/,
      }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123");
  });

  it("generates a cover when a pick has no image", () => {
    const { container } = render(<Shelf ownerId="v" initial={view([pick])} />);
    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector('div[aria-hidden="true"]')?.textContent,
    ).toContain("NHS");
  });

  it("loads no iframe until the play button is tapped", () => {
    const { container } = render(<Shelf ownerId="v" initial={view([video])} />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Play Starting small tasks" }),
    );
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123?autoplay=1",
    );
    expect(frame).toHaveFocus();
  });

  it("shows a Today card without Save or Not for me", () => {
    render(<TodayPick picks={[video, weekRead]} />);
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Not for me" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /See this pick/ })).toHaveLength(
      2,
    );
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});
