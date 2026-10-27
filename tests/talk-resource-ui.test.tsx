import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ToolCard } from "@/features/talk/proposals";
import { resultLines } from "@/domain/talk-tools";

vi.mock("@/server/actions/talk", () => ({
  confirmProposal: vi.fn(),
  dismissProposal: vi.fn(),
}));
vi.mock("@/features/reminders/notifications", () => ({
  enableNotifications: vi.fn(),
  useAllowed: () => false,
}));
afterEach(cleanup);

it.each(["Working on it.", "Koe will look for this and put it on your Shelf."])(
  "does not claim a search happened for the stored marker %s",
  (result) => {
    render(
      <ToolCard
        messageId="m"
        tool={{
          id: "p",
          name: "find_resources",
          args: { goal: "sleep" },
          status: "done",
          result,
          query: "fixed sleep query",
        }}
        push={{ publicKey: null, subscribed: false }}
        hour12={false}
      />,
    );
    expect(screen.getByText(/^Koe would search for:/)).toBeVisible();
    expect(screen.queryByText(/^Koe searched for:/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Shelf" })).toHaveAttribute(
      "href",
      "/shelf",
    );
  },
);

it.each([resultLines.find_resources(0), resultLines.find_resources(3)])(
  "describes the completed search only for its result %s",
  (result) => {
    render(
      <ToolCard
        messageId="m"
        tool={{
          id: "p",
          name: "find_resources",
          args: { goal: "sleep" },
          status: "done",
          result,
          query: "fixed sleep query",
        }}
        push={{ publicKey: null, subscribed: false }}
        hour12={false}
      />,
    );
    expect(screen.getByText(/^Koe searched for:/)).toBeVisible();
    expect(
      screen.queryByText(/^Koe would search for:/),
    ).not.toBeInTheDocument();
  },
);
