// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

describe("sign-in rate limit", () => {
  it("refuses after 10 tries for the same email in a window", async () => {
    const { allow } = await import("@/server/rate-limit");
    const results = [];
    for (let i = 0; i < 12; i++)
      results.push(await allow("sign-in", "person@example.com"));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results.slice(10)).toEqual([false, false]);
  });
});

describe("test notification rate limit", () => {
  it("allows 5 a minute per person, not per network address", async () => {
    const { allow } = await import("@/server/rate-limit");
    const mine = [];
    for (let i = 0; i < 6; i++)
      mine.push(await allow("reminder-test", "user-1"));
    expect(mine).toEqual([true, true, true, true, true, false]);
    expect(await allow("reminder-test", "user-2")).toBe(true);
  });
});
