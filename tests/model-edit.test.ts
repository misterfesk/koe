// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { emptyModel } from "@/domain/intake";
import { clearsWords, editedModel, modelEdit } from "@/domain/model-edit";
const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({
  requireViewer: async () => viewer.current,
  getViewer: async () => viewer.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth", () => ({
  auth: async () => ({ api: { signOut: async () => {} } }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
function input(version = 0) {
  const { eatingConcern: _flag, ...model } = emptyModel();
  void _flag;
  return {
    version,
    summary: "Your saved summary",
    model: {
      ...model,
      goals: ["sleep"] as const,
      notes: { day: "Quiet afternoons" },
      names: [{ name: "Sam", save: false }],
    },
  };
}
async function setup(memoryOn = true) {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  for (const id of ["a", "b"]) {
    await db
      .insert(schema.user)
      .values({ id, name: id, email: id + "@example.com" });
    await db
      .insert(schema.profile)
      .values({ userId: id, memoryOn, timezone: "UTC" });
  }
  const select = async (id = "a") => {
    const [profile] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, id));
    viewer.current = {
      db,
      user: { id },
      profile,
      today: "2026-10-27",
      isGuest: true,
    };
    return profile;
  };
  await select();
  return { db, schema, select };
}
describe("saved information", { timeout: 30000 }, () => {
  it("creates encrypted information without intake, people, reminders or a plan", async () => {
    const { db, schema } = await setup();
    const { editUserModel } = await import("@/server/actions/settings");
    expect(await editUserModel(input())).toMatchObject({
      ok: true,
      version: 1,
    });
    const { getUserModel } = await import("@/server/data/intake");
    expect(await getUserModel(db, "a")).toMatchObject({
      summary: "Your saved summary",
      model: { notes: { day: "Quiet afternoons" } },
    });
    const [raw] = await db.select().from(schema.userModel);
    expect(raw.dataEnc).not.toContain("Quiet afternoons");
    expect(raw.summaryEnc).not.toContain("Your saved summary");
    for (const table of [
      schema.person,
      schema.planDay,
      schema.reminder,
      schema.agentRun,
    ])
      expect(await db.select().from(table)).toEqual([]);
  });
  it("scopes writes to the viewer and rejects stale versions and concurrent creation", async () => {
    const { db, select } = await setup();
    const { editUserModel } = await import("@/server/actions/settings");
    const { getUserModel, saveUserModel } =
      await import("@/server/data/intake");
    await editUserModel(input());
    await select("b");
    expect(await editUserModel(input(1))).toMatchObject({ ok: false });
    expect(await getUserModel(db, "b")).toBeNull();
    await select("a");
    expect(await editUserModel(input(1))).toMatchObject({
      ok: true,
      version: 2,
    });
    expect(await editUserModel(input(1))).toMatchObject({ ok: false });
    expect(await saveUserModel(db, "a", 1, emptyModel(), "stale")).toBeNull();
    expect(await saveUserModel(db, "a", 0, emptyModel(), "stale")).toBeNull();
    expect((await getUserModel(db, "a"))?.summary).toBe("Your saved summary");
  });
  it("keeps memory off and active settings unchanged while allowing edits and export", async () => {
    const { db, select } = await setup(false);
    const { editUserModel } = await import("@/server/actions/settings");
    const answers = input();
    expect(
      await editUserModel({
        ...answers,
        model: { ...answers.model, tone: "plain", morningPlan: "10:00" },
      }),
    ).toMatchObject({ ok: true });
    const profile = await select();
    expect(profile.memoryOn).toBe(false);
    expect(profile.tone).not.toBe("plain");
    const { buildContext } = await import("@/server/llm/context");
    const packet = await buildContext(db, "a", "2026-10-27");
    expect(packet.memory).toBe("off");
    expect(packet.intake).toBeUndefined();
    expect(packet.summary).toBeUndefined();
    const { GET } = await import("@/app/api/export/route");
    const exported = await (await GET()).json();
    expect(exported.userModel.model.names[0].name).toBe("Sam");
    expect(exported.planDays).toEqual([]);
    expect(exported.shelf).toBeDefined();
  });
  it("derives and retains eating constraints, including summary edits", async () => {
    const { db } = await setup();
    const { editUserModel } = await import("@/server/actions/settings");
    const { getUserModel } = await import("@/server/data/intake");
    await editUserModel({ ...input(), summary: "I worry about my weight" });
    expect((await getUserModel(db, "a"))?.model.eatingConcern).toBe(true);
    await editUserModel(input(1));
    expect((await getUserModel(db, "a"))?.model.eatingConcern).toBe(true);
    expect(
      await editUserModel({
        ...input(2),
        model: { ...input().model, eatingConcern: false },
      }),
    ).toMatchObject({ ok: false });
    expect(editedModel(modelEdit.parse(input()).model).eatingConcern).toBe(
      false,
    );
  });
  it("screens all saved free text and never clears a coaching pause", async () => {
    const { db, schema, select } = await setup();
    const { editUserModel } = await import("@/server/actions/settings");
    expect(
      await editUserModel({
        ...input(),
        model: { ...input().model, notes: { people: "I want to end it all" } },
      }),
    ).toMatchObject({ ok: true, safety: "urgent" });
    expect((await select()).coachingPausedAt).not.toBeNull();
    await editUserModel(input(1));
    expect((await select()).coachingPausedAt).not.toBeNull();
    const events = await db.select().from(schema.safetyEvent);
    expect(events[0].surface).toBe("memory");
    expect(JSON.stringify(events)).not.toContain("end it all");
    expect(
      await editUserModel({
        ...input(2),
        model: { ...input().model, notes: { day: "x".repeat(201) } },
      }),
    ).toMatchObject({ ok: false });
  });
  it("confirms clearing words once, while ordinary rewording is editable", () => {
    const previous = {
      model: {
        ...emptyModel(),
        notes: { day: "Old words", goals: "Old goal" },
      },
      summary: "Summary",
    };
    expect(clearsWords(previous, { ...previous, summary: "New wording" })).toBe(
      false,
    );
    expect(clearsWords(previous, { model: emptyModel(), summary: "" })).toBe(
      true,
    );
  });
});
