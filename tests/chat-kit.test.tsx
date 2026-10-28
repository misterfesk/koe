import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AskCard,
  ChatThread,
  Message,
  TypingDots,
  type AskCardProps,
} from "@/components/chat";
import type { ChatAsk } from "@/domain/chat-turn";

afterEach(cleanup);
const ask: ChatAsk = {
  kind: "single",
  options: [
    { id: "sleep", label: "Sleep is patchy" },
    { id: "start", label: "Starting is hard" },
  ],
  allowOther: true,
  placeholder: "e.g. You keep putting off an email.",
  info: "Your answer shapes what comes next.",
};
function Controlled(props: Partial<AskCardProps>) {
  const [value, onChange] = useState(props.value ?? []);
  const [other, onOtherChange] = useState(props.other ?? "");
  return (
    <AskCard
      ask={ask}
      label="What's been getting in the way?"
      {...props}
      value={value}
      other={other}
      onChange={props.onChange ?? onChange}
      onOtherChange={props.onOtherChange ?? onOtherChange}
    />
  );
}

describe("AskCard", () => {
  it("controls single choices, replaces a pick, and allows deselection", () => {
    render(<Controlled />);
    const first = screen.getByRole("button", { name: "Sleep is patchy" });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    const second = screen.getByRole("button", { name: "Starting is hard" });
    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "false");
  });
  it("opens inline text without changing picks, focuses it, and preserves typed words", async () => {
    render(<Controlled value={["sleep"]} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "✎ Something else…" }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const field = screen.getByRole("textbox", { name: "Your words" });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: "An email to send" } });
    expect(field).toHaveValue("An email to send");
    expect(field).toHaveAttribute("placeholder", ask.placeholder);
    expect(
      screen.getByRole("button", { name: "Sleep is patchy" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("enforces a multi limit while allowing deselection and retaining other text", () => {
    render(
      <Controlled
        ask={{ ...ask, kind: "multi" }}
        maxSelections={1}
        other="An email"
      />,
    );
    const first = screen.getByRole("button", { name: "Sleep is patchy" });
    const second = screen.getByRole("button", { name: "Starting is hard" });
    fireEvent.click(first);
    expect(second).toBeDisabled();
    fireEvent.click(first);
    expect(second).toBeEnabled();
    expect(screen.getByRole("textbox")).toHaveValue("An email");
  });
  it("supports keyboard focus between choices and leaves selection explicit", () => {
    render(<Controlled />);
    const first = screen.getByRole("button", { name: "Sleep is patchy" });
    const second = screen.getByRole("button", { name: "Starting is hard" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(second, { key: "Home" });
    expect(first).toHaveFocus();
  });
  it("has a labelled text-only fallback for malformed asks", () => {
    render(<Controlled ask={{ kind: "invalid" } as unknown as ChatAsk} />);
    expect(screen.getByRole("group")).toHaveAccessibleName(
      "What's been getting in the way?",
    );
    expect(
      screen.getByRole("textbox", { name: "Your answer" }),
    ).toHaveAttribute("placeholder", expect.stringContaining("e.g."));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "200");
  });
  it("lets the caller match the field limit to its server schema", () => {
    const { rerender } = render(<Controlled other="Email" maxLength={400} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "400");
    rerender(
      <Controlled ask={{ kind: "text", allowOther: false }} maxLength={100} />,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "100");
  });
  it("honours disabled and zero-selection states", () => {
    const change = vi.fn();
    const { rerender } = render(
      <Controlled disabled onChange={change} other="Email" />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(
      screen
        .getAllByRole("button")
        .every((button) => button.matches(":disabled")),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sleep is patchy" }));
    expect(change).not.toHaveBeenCalled();
    rerender(<Controlled maxSelections={0} onChange={change} />);
    expect(
      screen.getByRole("button", { name: "Sleep is patchy" }),
    ).toBeDisabled();
  });
  it("uses a native accessible disclosure and omits Other when forbidden", () => {
    render(<Controlled ask={{ ...ask, allowOther: false }} />);
    const disclosure = screen.getByText("Why this question?");
    expect(disclosure.tagName).toBe("SUMMARY");
    expect(disclosure.closest("details")).toHaveTextContent(ask.info!);
    expect(
      screen.queryByRole("button", { name: /Something else/ }),
    ).not.toBeInTheDocument();
  });
});

describe("chat transcript", () => {
  it("follows new replies until the person scrolls up, then resumes near the end", () => {
    const changed = vi.fn();
    const messages = [
      { id: "1", role: "assistant" as const, text: "What fits today?" },
    ];
    const { rerender } = render(
      <ChatThread messages={messages} onFollowChange={changed} />,
    );
    const log = screen.getByRole("log");
    Object.defineProperties(log, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    log.scrollTop = 300;
    fireEvent.scroll(log);
    rerender(
      <ChatThread
        messages={[
          ...messages,
          { id: "2", role: "assistant", text: "Tell me about the email." },
        ]}
        onFollowChange={changed}
      />,
    );
    expect(log.scrollTop).toBe(300);
    expect(changed).toHaveBeenCalledWith(false);
    log.scrollTop = 800;
    fireEvent.scroll(log);
    rerender(
      <ChatThread messages={messages} onFollowChange={changed} loading />,
    );
    expect(log.scrollTop).toBe(1000);
    expect(changed).toHaveBeenCalledWith(true);
  });
  it("allows following to be disabled and has one live announcement", () => {
    const { rerender } = render(
      <ChatThread messages={[]} autoScroll={false} loading />,
    );
    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "off");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Koe is replying.");
    Object.defineProperty(log, "scrollHeight", { value: 1000 });
    rerender(
      <ChatThread
        messages={[{ id: "1", role: "assistant", text: "Your checked reply" }]}
        autoScroll={false}
      />,
    );
    expect(log.scrollTop).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent("Your checked reply");
  });
  it("renders text without interpreting markup; dots are decorative", () => {
    const { container } = render(
      <>
        <Message role="assistant" text={"<script>bad()</script>"} />
        <TypingDots />
      </>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("<script>bad()</script>");
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
