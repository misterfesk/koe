// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  viewer: null as unknown,
  signup: vi.fn(),
  signin: vi.fn(),
}));
vi.mock("@/server/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/server/auth", () => ({
  auth: async () => ({
    api: { signUpEmail: state.signup, signInEmail: state.signin },
  }),
}));
vi.mock("@/server/rate-limit", () => ({ allow: async () => true }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("REDIRECT " + path);
  },
}));
const form = (browser = true) => {
  const data = new FormData();
  data.set("email", "synthetic@example.com");
  data.set("password", "synthetic-long-password");
  data.set("from", "untrusted-owner");
  if (browser) data.set("draftHandoff", "browser");
  return data;
};
beforeEach(() => {
  state.viewer = { user: { id: "authenticated-guest" }, isGuest: true };
  state.signup
    .mockReset()
    .mockResolvedValue({ user: { id: "confirmed-account" } });
  state.signin
    .mockReset()
    .mockResolvedValue({ user: { id: "confirmed-account" } });
});
describe("browser draft handoff", () => {
  it("uses authenticated guest and confirmed account IDs, for signup and signin", async () => {
    const { createAccount, signIn } = await import("@/server/actions/account");
    for (const action of [createAccount, signIn])
      expect(await action(null, form())).toMatchObject({
        ok: true,
        transferredDrafts: {
          from: "authenticated-guest",
          to: "confirmed-account",
        },
      });
  });
  it("does not transfer another signed-in account or failed authentication", async () => {
    const { signIn } = await import("@/server/actions/account");
    state.viewer = { user: { id: "other-account" }, isGuest: false };
    expect(await signIn(null, form())).not.toHaveProperty("transferredDrafts");
    state.signin.mockRejectedValue(new Error("failure"));
    expect(await signIn(null, form())).toMatchObject({ ok: false });
  });
  it("preserves server redirects without browser enhancement", async () => {
    const { createAccount, signIn } = await import("@/server/actions/account");
    await expect(createAccount(null, form(false))).rejects.toThrow(
      "REDIRECT /you/account?created=1",
    );
    await expect(signIn(null, form(false))).rejects.toThrow("REDIRECT /today");
  });
});
