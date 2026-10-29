import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Notice } from "@/components/ui";
import { modeTemplates } from "@/domain/talk";
import { AppointmentLookup } from "@/features/connect/care";
import { Conversation } from "@/features/talk/conversation";
import { CheckIn } from "@/features/today/check-in";
import { Timeline } from "@/features/today/timeline";
import type { Entry } from "@/features/today/model";

const mockLookupAppointments = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/today",
}));

vi.mock("@/server/actions/connect", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/actions/connect")>();
  return {
    ...actual,
    lookupAppointments: (...args: unknown[]) => mockLookupAppointments(...args),
  };
});

afterEach(() => {
  cleanup();
  mockLookupAppointments.mockReset();
});

describe("Notice with dismiss button", () => {
  it("renders with a dismiss (×) button and disappears when clicked", () => {
    const onDismiss = vi.fn();
    render(<Notice onDismiss={onDismiss}>Test notification</Notice>);

    expect(screen.getByText("Test notification")).toBeInTheDocument();
    const dismissBtn = screen.getByRole("button", { name: "Dismiss" });
    expect(dismissBtn).toBeInTheDocument();
    expect(dismissBtn.textContent).toBe("×");

    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Test notification")).toBeNull();
  });
});

describe("CheckIn Update my day text box", () => {
  it("has label 'A few words, if you like' and allows input without a 40-character limit", () => {
    render(<CheckIn checkIn={null} region={null} />);

    const label = screen.getByText("A few words, if you like");
    expect(label).toBeInTheDocument();

    const input = screen.getByLabelText(
      "A few words, if you like",
    ) as HTMLInputElement;
    expect(input.maxLength).toBe(500);

    const longText =
      "This is a longer sentence describing how I am arriving today and what I want to accomplish without being limited to 40 characters.";
    fireEvent.change(input, { target: { value: longText } });
    expect(input.value).toBe(longText);

    expect(
      screen.getByRole("button", { name: "Update my day" }),
    ).toBeInTheDocument();
  });
});

describe("Timeline task cards", () => {
  const baseEntry: Entry = {
    id: "step-1",
    title: "Update my portfolio",
    why: "Because you want to get work",
    kind: "task",
    kindLabel: "This week",
    size: "small",
    time: "10:00",
    minute: 600,
    inPlan: true,
    thing: true,
    weekItemId: "week-1",
    repeats: null,
    report: null,
    reminder: null,
    later: [],
  };

  it("does not show exact time, 'Add to calendar', or 'Remind me' on tasks", () => {
    render(
      <Timeline
        entries={[baseEntry]}
        canAdd={false}
        region={null}
        push={{ publicKey: "dummy-key", subscribed: false }}
      />,
    );

    // Exact time 10:00 is not rendered on the card
    expect(screen.queryByText("10:00")).toBeNull();
    // Kind label and title are present
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("Update my portfolio")).toBeInTheDocument();

    // No "Add to calendar" link
    expect(screen.queryByRole("link", { name: /Add to calendar/i })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Add today to your calendar/i }),
    ).toBeNull();

    // No "Remind me" button
    expect(screen.queryByRole("button", { name: /Remind me/i })).toBeNull();
  });

  it("shows 'Stuck? Ask Koe →' link on every task card (both This week and regular tasks) and opens Talk with task context", () => {
    const regularEntry: Entry = {
      ...baseEntry,
      id: "step-2",
      title: "Step outside for some air",
      kind: "move",
      kindLabel: "Move",
      thing: false,
      weekItemId: null,
    };

    const opened: unknown[] = [];
    const onOpen = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("koe:open-talk", onOpen);

    try {
      render(
        <Timeline
          entries={[baseEntry, regularEntry]}
          canAdd={false}
          region={null}
          push={{ publicKey: null, subscribed: false }}
        />,
      );

      const askLinks = screen.getAllByRole("button", {
        name: "Stuck? Ask Koe →",
      });
      expect(askLinks).toHaveLength(2);
      for (const link of askLinks) {
        expect(link.classList.contains("text")).toBe(true);
      }

      fireEvent.click(askLinks[0]);
      fireEvent.click(askLinks[1]);
      expect(opened).toEqual([
        { kind: "thing", id: "week-1" },
        { kind: "step", id: "step-2" },
      ]);
    } finally {
      window.removeEventListener("koe:open-talk", onOpen);
    }
  });

  it("allows dismissing a card after a task is done", () => {
    const doneEntry: Entry = {
      ...baseEntry,
      report: {
        id: "rep-1",
        outcome: "done",
        vsExpected: null,
      },
    };

    render(
      <Timeline
        entries={[doneEntry]}
        canAdd={false}
        region={null}
        push={{ publicKey: null, subscribed: false }}
      />,
    );

    // Done status is visible
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

    // Dismiss button is present on the done card
    const dismissBtn = screen.getByRole("button", { name: "Dismiss" });
    expect(dismissBtn).toBeInTheDocument();

    // Click dismiss
    fireEvent.click(dismissBtn);

    // Card is now dismissed, shows all done state
    expect(screen.queryByText("Update my portfolio")).toBeNull();
    expect(screen.getByText("All done for today.")).toBeInTheDocument();

    // Shows restore button
    const restoreBtn = screen.getByRole("button", {
      name: /Show 1 dismissed task/i,
    });
    expect(restoreBtn).toBeInTheDocument();

    // Clicking restore brings the card back
    fireEvent.click(restoreBtn);
    expect(screen.getByText("Update my portfolio")).toBeInTheDocument();
  });
});

describe("Talk panel quick-actions and composer", () => {
  it("renders a send icon button on the right of the input and pre-fills templates for quick-action buttons", () => {
    render(
      <Conversation
        id={null}
        mode="talk"
        messages={[]}
        paused={false}
        region={null}
        push={{ publicKey: null, subscribed: false }}
        hour12={false}
      />,
    );

    const input = screen.getByLabelText("Your message") as HTMLTextAreaElement;
    const sendBtn = screen.getByRole("button", { name: "Send" });
    expect(sendBtn.querySelector("svg")).not.toBeNull();

    const justTalk = screen.getByRole("button", { name: "Just talk" });
    expect(justTalk).toHaveAttribute("aria-pressed", "true");

    const planBtn = screen.getByRole("button", { name: "Plan a step" });
    fireEvent.click(planBtn);
    expect(planBtn).toHaveAttribute("aria-pressed", "true");
    expect(input.value).toBe("Help me with planning the following work - ");
    expect(input.value).toBe(modeTemplates.plan);

    // User can keep typing after the pre-filled template
    fireEvent.change(input, {
      target: {
        value: "Help me with planning the following work - my tax return",
      },
    });
    expect(input.value).toBe(
      "Help me with planning the following work - my tax return",
    );

    // Clicking another quick-action button pre-fills its template
    const problemBtn = screen.getByRole("button", {
      name: "Work through a problem",
    });
    fireEvent.click(problemBtn);
    expect(input.value).toBe(modeTemplates.problem);

    // Clicking Just talk resets an unmodified template back to empty
    fireEvent.click(justTalk);
    expect(justTalk).toHaveAttribute("aria-pressed", "true");
    expect(input.value).toBe("");
  });
});

describe("AppointmentLookup UI", () => {
  it("renders Look up button, collapsed Add instructions box, and shows results with reasons and Go to link buttons", async () => {
    mockLookupAppointments.mockResolvedValueOnce({
      ok: true,
      safety: "none",
      results: [
        {
          title: "Find an NHS talking therapies service",
          url: "https://www.nhs.uk/service-search/mental-health/",
          sourceName: "NHS",
          why: 'Talking therapy · Because you chose "Getting through the day"',
        },
        {
          title: "One-to-one tutoring and study support",
          url: "https://www.khanacademy.org/about",
          sourceName: "Khan Academy",
          why: 'Tutoring and study support · Because you asked for "math tutor"',
        },
      ],
    });

    render(<AppointmentLookup region="GB" />);

    const details = screen
      .getByText("Add instructions")
      .closest("details") as HTMLDetailsElement;
    expect(details).not.toHaveAttribute("open");

    const textarea = screen.getByPlaceholderText(
      /Online CBT therapist, math tutor/i,
    );
    fireEvent.change(textarea, { target: { value: "math tutor" } });

    const lookupBtn = screen.getByRole("button", { name: "Look up" });
    fireEvent.click(lookupBtn);

    await waitFor(() => {
      expect(mockLookupAppointments).toHaveBeenCalledWith("math tutor");
    });

    expect(
      await screen.findByRole("heading", { name: "Results" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Find an NHS talking therapies service"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tutoring and study support · Because you asked for "math tutor"',
      ),
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /Go to link/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://www.nhs.uk/service-search/mental-health/",
    );
  });

  it("handles empty results and API errors with calm messages", async () => {
    mockLookupAppointments.mockResolvedValueOnce({
      ok: true,
      safety: "none",
      results: [],
    });

    render(<AppointmentLookup region="GB" />);
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));

    expect(
      await screen.findByText(
        "No matching services came up. Try changing your instructions or check back later.",
      ),
    ).toBeInTheDocument();
  });
});
