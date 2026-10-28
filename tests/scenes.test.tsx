// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sceneFor, sceneIds } from "@/domain/scene";
import { FlatScene } from "@/features/scenes/flat";
import { scenes } from "@/features/scenes/geometry";
import { InkScene } from "@/features/scenes/ink";

describe("sceneFor", () => {
  it("follows the local hour", () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22, 0].map((h) => sceneFor(h))).toEqual([
      "night",
      "morning",
      "morning",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
      "night",
      "night",
    ]);
  });
  it("a lighter day overrides the time", () => {
    for (const h of [0, 8, 14, 19]) expect(sceneFor(h, true)).toBe("lighter");
  });
});

describe("geometry", () => {
  it("has the five scenes, small, with at most two moving shapes", () => {
    expect(Object.keys(scenes).sort()).toEqual([...sceneIds].sort());
    for (const id of sceneIds) {
      expect(scenes[id].length).toBeLessThanOrEqual(25);
      expect(
        scenes[id].filter((s) => s.role === "motion").length,
      ).toBeLessThanOrEqual(2);
      expect(scenes[id].every((s) => s.role !== "motion" || s.anim)).toBe(true);
    }
  });
  it("lighter has fewer objects than any other scene", () => {
    const n = (id: (typeof sceneIds)[number]) =>
      scenes[id].filter((s) => s.role !== "wall" && s.role !== "light").length;
    for (const id of sceneIds.filter((i) => i !== "lighter"))
      expect(n("lighter")).toBeLessThan(n(id));
  });
});

describe.each([
  ["flat", FlatScene],
  ["ink", InkScene],
])("%s renderer", (name, Scene) => {
  it.each(sceneIds)("renders %s as decorative inline SVG", (id) => {
    const html = renderToStaticMarkup(<Scene sceneId={id} />);
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain(`data-style="${name}"`);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(html).not.toContain("<text");
  });
});

const fixture = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock("@/server/viewer", () => ({
  requireViewer: async () => fixture.viewer,
  getViewer: async () => fixture.viewer,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describe("scene_style setting", () => {
  let db: Awaited<ReturnType<(typeof import("@/server/db"))["openDb"]>>;
  beforeAll(async () => {
    process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    db = await (await import("@/server/db")).openDb("memory:");
  }, 30_000);
  const read = async (id: string) => {
    const { profile } = await import("@/server/db/schema");
    return (await db.select().from(profile).where(eq(profile.userId, id)))[0];
  };
  it("defaults to flat, saves ink, and rejects other values", async () => {
    const schema = await import("@/server/db/schema");
    const id = crypto.randomUUID();
    await db
      .insert(schema.user)
      .values({ id, name: "Synthetic", email: `${id}@example.com` });
    await db.insert(schema.profile).values({ userId: id });
    fixture.viewer = { user: { id }, profile: await read(id), db };
    expect((await read(id)).sceneStyle).toBe("flat");
    const { setAppearance } = await import("@/server/actions/settings");
    await setAppearance({ sceneStyle: "ink" });
    expect((await read(id)).sceneStyle).toBe("ink");
    await expect(
      setAppearance({ sceneStyle: "neon" as never }),
    ).rejects.toThrow();
    expect((await read(id)).sceneStyle).toBe("ink");
    await setAppearance({ plain: true });
    expect((await read(id)).sceneStyle).toBe("ink");
  });
});
