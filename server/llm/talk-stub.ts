import "server-only";
import type { RiskLevel } from "@/domain/safety";
import type { MessageView } from "../data/talk";
import type { ToolCall } from "./nebius";
import type { TalkContext } from "./talk";

// A scripted stand-in for Talk's model, for end-to-end tests only. It returns
// fixed replies and tool calls for a few known messages, so the real rules,
// cards and confirm actions can be tested without a provider.
//
// It can never run on a hosted app: it needs KOE_AI_STUB=on AND an APP_URL on
// this machine (127.0.0.1 or localhost), the same guard as KOE_PUSH_STUB.
// Playwright sets both; nothing else does. See ARCHITECTURE.md, "Operations".

export const talkStubbed = () =>
  process.env.KOE_AI_STUB === "on" &&
  /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(
    process.env.APP_URL ?? "",
  );

/** The stub never judges risk: the rules screen has already run. */
export const stubClassify = (): RiskLevel => "none";

type Seen = { id?: string; kind?: string; title?: string };

const clock = (text: string) => {
  const m = /\b(\d{1,2})(?::(\d\d))?\s?(am|pm)\b/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return h * 60 + Number(m[2] ?? 0);
};

export function stubTurn(
  history: MessageView[],
  context: TalkContext,
): { content: string | null; toolCalls: ToolCall[] } {
  const said = [...history].reverse().find((m) => m.role === "user");
  const text = (said?.content ?? "").toLowerCase();
  const items = (context.packet.today?.items ?? []) as Seen[];
  // "my walk" finds the item whose title has the word, else a movement item,
  // else the first item of the day (a new guest's day may have no walk in it).
  const find = (word: string) =>
    items.find((i) => i.title?.toLowerCase().includes(word)) ??
    items.find((i) => i.kind === "move") ??
    items[0];
  const call = (name: string, args: unknown): ToolCall => ({
    id: "stub_1",
    name,
    args,
  });

  const move = /move my (\w+) to /.exec(text);
  if (move) {
    const item = find(move[1]);
    const at = clock(text);
    if (item?.id && at !== null)
      return {
        content: "I can move it. Want me to?",
        toolCalls: [call("move_item", { itemId: item.id, minuteOfDay: at })],
      };
    return { content: "Which one do you mean?", toolCalls: [] };
  }
  const remind = /remind me about my (\w+)/.exec(text);
  if (remind) {
    const item = find(remind[1]);
    if (item?.id)
      return {
        content: "I can set a reminder for it. Want me to?",
        toolCalls: [call("set_reminder", { itemId: item.id })],
      };
    return { content: "Which one do you mean?", toolCalls: [] };
  }
  const read = /find me something to read about (\w+)/.exec(text);
  if (read)
    return {
      content: "I can look for that. Want me to?",
      toolCalls: [call("find_resources", { goal: read[1], format: "article" })],
    };
  if (/rough morning/.test(text))
    return {
      content: "That sounds like a hard start. What made it feel rough?",
      toolCalls: [],
    };
  if (/^help me with this task:/i.test(said?.content ?? "")) {
    const focusTitle = (context.packet.focus as { title?: string } | undefined)
      ?.title;
    return {
      content: focusTitle
        ? `What part of "${focusTitle}" feels hardest to start?`
        : "Which part of it feels hardest to start?",
      toolCalls: [],
    };
  }
  return { content: "I'm listening. Say as much as you like.", toolCalls: [] };
}
