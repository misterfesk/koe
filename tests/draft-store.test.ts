import { describe, expect, it } from "vitest";
import {
  clearOwnerDrafts,
  planDraft,
  problemDraft,
  transferOwnerDrafts,
} from "@/features/today/draft-store";
describe("tab-local drafts", () => {
  it("rejects malformed shapes and unknown kinds without rejecting valid long drafts", () => {
    expect(planDraft.safeParse(null).success).toBe(false);
    expect(
      planDraft.safeParse({ kind: "unknown", title: "abc", time: "" }).success,
    ).toBe(false);
    expect(
      planDraft.safeParse({
        kind: "enjoy",
        title: "a".repeat(140),
        time: "23:59",
      }).success,
    ).toBe(true);
    expect(
      planDraft.safeParse({ kind: "enjoy", title: "abc", time: "29:00" })
        .success,
    ).toBe(false);
    expect(
      problemDraft.safeParse({
        stage: "plan",
        problem: "x".repeat(1000),
        options: ["one", "two"],
        chosen: "one",
      }).success,
    ).toBe(true);
    expect(
      problemDraft.safeParse({
        stage: "unexpected",
        problem: "",
        options: null,
        chosen: "",
      }).success,
    ).toBe(false);
  });
  it("clears this owner's intake, add, problem, plan and reach-out drafts only", () => {
    sessionStorage.clear();
    const owned = [
      "koe.intake.draft.v1",
      "koe.plan-draft:add:a",
      "koe.plan-draft:problem:a",
      "koe.plan-draft:model:a",
      "koe.plan-draft:problem-plan:a:opaque",
      "koe.plan-draft:reach-out:a:person",
    ];
    const kept = [
      "unrelated",
      "koe.plan-draft:add:b",
      "koe.plan-draft:problem-plan:aa:opaque",
      "koe.plan-draft:reach-out:b:person",
    ];
    for (const key of [...owned, ...kept])
      sessionStorage.setItem(key, "saved words");
    clearOwnerDrafts(sessionStorage, "a");
    for (const key of owned) expect(sessionStorage.getItem(key)).toBeNull();
    for (const key of kept)
      expect(sessionStorage.getItem(key)).toBe("saved words");
  });
  it("moves only linked guest drafts and preserves collisions under the account's deletion scope", () => {
    sessionStorage.clear();
    sessionStorage.setItem("koe.plan-draft:add:guest", "guest words");
    sessionStorage.setItem("koe.plan-draft:add:account", "account words");
    sessionStorage.setItem("koe.plan-draft:problem:guest", "guest problem");
    sessionStorage.setItem("koe.plan-draft:model:guest", "guest model draft");
    sessionStorage.setItem(
      "koe.plan-draft:reach-out:guest:person",
      "guest reach-out",
    );
    sessionStorage.setItem("koe.plan-draft:add:unrelated", "keep");
    transferOwnerDrafts(sessionStorage, "guest", "account");
    expect(sessionStorage.getItem("koe.plan-draft:add:guest")).toBeNull();
    expect(sessionStorage.getItem("koe.plan-draft:add:account")).toBe(
      "account words",
    );
    expect(
      Object.keys(sessionStorage).some(
        (key) =>
          key.startsWith("koe.plan-draft:linked:account:") &&
          sessionStorage.getItem(key) === "guest words",
      ),
    ).toBe(true);
    expect(sessionStorage.getItem("koe.plan-draft:problem:account")).toBe(
      "guest problem",
    );
    expect(sessionStorage.getItem("koe.plan-draft:model:account")).toBe(
      "guest model draft",
    );
    expect(
      sessionStorage.getItem("koe.plan-draft:reach-out:account:person"),
    ).toBe("guest reach-out");
    clearOwnerDrafts(sessionStorage, "account");
    expect(Object.keys(sessionStorage)).toEqual([
      "koe.plan-draft:add:unrelated",
    ]);
  });
});
