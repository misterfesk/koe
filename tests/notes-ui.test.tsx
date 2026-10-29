import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LookBackPage from "@/app/(app)/you/look-back/page";
import JourneyPage from "@/app/(app)/you/look-back/journey/page";
import EntryPage from "@/app/(app)/you/look-back/entry/[id]/page";
import StepsIdPage from "@/app/(app)/steps/[id]/page";
import { SavedNotesList } from "@/features/journey/parts";

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/you/notes",
}));

const mockViewer = vi.hoisted(() => ({
  user: { id: "user-1", email: "user@example.test" },
  profile: { timezone: "UTC", region: "GB" },
  db: null as unknown,
  today: "2026-10-29",
  isGuest: true,
}));

vi.mock("@/server/viewer", () => ({
  requireViewer: async () => mockViewer,
}));

vi.mock("@/server/data/intake", () => ({
  getPlanDay: async () => null,
}));

afterEach(() => {
  cleanup();
  mockRedirect.mockReset();
});

describe("Notes UI component", () => {
  const sampleNotes = [
    {
      id: "note-1",
      kind: "note" as const,
      text: "Recent thoughts on morning routine",
      energy: "more" as const,
      createdAt: new Date("2026-10-29T10:00:00Z").toISOString(),
    },
    {
      id: "note-2",
      kind: "note" as const,
      text: "Feeling tired in the afternoon",
      energy: "low" as const,
      createdAt: new Date("2026-10-28T15:30:00Z").toISOString(),
    },
  ];

  it("renders saved notes list newest first with metadata", () => {
    render(
      <SavedNotesList
        notes={sampleNotes}
        region="GB"
        timezone="UTC"
        today="2026-10-29"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Saved notes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recent thoughts on morning routine"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Feeling tired in the afternoon"),
    ).toBeInTheDocument();

    // Check energy metadata
    expect(screen.getByText(/More than usual/)).toBeInTheDocument();
    expect(screen.getByText(/Low/)).toBeInTheDocument();
  });

  it("clicking Edit opens the inline textarea with Save and Cancel", () => {
    render(
      <SavedNotesList
        notes={sampleNotes}
        region="GB"
        timezone="UTC"
        today="2026-10-29"
      />,
    );

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    fireEvent.click(editButtons[0]);

    const textarea = screen.getByDisplayValue(
      "Recent thoughts on morning routine",
    );
    expect(textarea).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toBeInTheDocument();

    // Cancel restores original display
    fireEvent.click(cancelBtn);
    expect(
      screen.getByText("Recent thoughts on morning routine"),
    ).toBeInTheDocument();
  });

  it("clicking Delete note displays the confirmation prompt", () => {
    render(
      <SavedNotesList
        notes={sampleNotes}
        region="GB"
        timezone="UTC"
        today="2026-10-29"
      />,
    );

    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete note",
    });
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText("Delete this note?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Yes, delete note" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  });
});

describe("Parked Look back UI and redirects", () => {
  it("renders the cat placeholder with exact coming soon message", async () => {
    const page = await LookBackPage();
    render(page);

    expect(
      screen.getByRole("heading", { level: 1, name: "Look back" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reflecting on your days is coming soon."),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-look-back-parked]"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-look-back-parked] svg"),
    ).toBeInTheDocument();
  });

  it("redirects legacy and subroutes to /you/look-back and /today", async () => {
    await JourneyPage();
    expect(mockRedirect).toHaveBeenCalledWith("/you/look-back");
    mockRedirect.mockReset();

    await EntryPage();
    expect(mockRedirect).toHaveBeenCalledWith("/you/look-back");
    mockRedirect.mockReset();

    await StepsIdPage({ params: Promise.resolve({ id: "old-step-123" }) });
    expect(mockRedirect).toHaveBeenCalledWith("/today");
  });
});
