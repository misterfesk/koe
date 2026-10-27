import { afterEach, describe, expect, it } from "vitest";
import { talkStubbed } from "@/server/llm/talk-stub";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("the scripted Talk model (tests only)", () => {
  it("is off unless asked for", () => {
    delete process.env.KOE_AI_STUB;
    process.env.APP_URL = "http://127.0.0.1:3200";
    expect(talkStubbed()).toBe(false);
  });

  it("runs only on this machine", () => {
    process.env.KOE_AI_STUB = "on";
    for (const url of [
      "http://127.0.0.1:3200",
      "http://localhost:3100",
      "http://localhost",
    ]) {
      process.env.APP_URL = url;
      expect(talkStubbed(), url).toBe(true);
    }
  });

  it("can never run on a hosted app", () => {
    process.env.KOE_AI_STUB = "on";
    for (const url of [
      "https://koe.example.com",
      "https://127.0.0.1.evil.example",
      "http://127.0.0.1@evil.example",
      "http://localhost.evil.example",
      "",
    ]) {
      process.env.APP_URL = url;
      expect(talkStubbed(), url).toBe(false);
    }
    delete process.env.APP_URL;
    expect(talkStubbed()).toBe(false);
  });
});
