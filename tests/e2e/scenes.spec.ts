import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { startAsGuest } from "./helpers";

const scenes = ["morning", "afternoon", "evening", "night", "lighter"];

test("the swatch switches the scene style and it survives a reload", async ({
  page,
}) => {
  await startAsGuest(page);
  const group = page.getByRole("radiogroup", { name: "Scene style" });
  const flat = group.getByRole("radio", { name: "Flat" });
  const ink = group.getByRole("radio", { name: "Ink line" });
  await expect(flat).toBeChecked();
  await expect(
    page.locator('[data-scene-slot] svg[data-style="flat"]'),
  ).toBeVisible();
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await ink.click();
  await expect(ink).toBeChecked();
  await expect(
    page.locator('[data-scene-slot] svg[data-style="ink"]'),
  ).toBeVisible();
  await saved;
  await page.reload();
  await expect(
    page
      .getByRole("radiogroup", { name: "Scene style" })
      .getByRole("radio", { name: "Ink line" }),
  ).toBeChecked();
  await expect(
    page.locator('[data-scene-slot] svg[data-style="ink"]'),
  ).toBeVisible();
  // Arrow keys move between the two.
  await page.getByRole("radio", { name: "Ink line" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Flat" })).toBeChecked();
});

test("Appearance has the same choice", async ({ page }) => {
  await startAsGuest(page);
  await page.goto("/you/appearance");
  const set = page.getByRole("group", { name: "Scene style" });
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await set.getByRole("radio", { name: "Ink line" }).check();
  await saved;
  await page.goto("/today");
  await expect(page.getByRole("radio", { name: "Ink line" })).toBeChecked();
});

test("reduced motion leaves nothing animating on the scene", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startAsGuest(page);
  await page.goto("/today?scene=morning");
  await expect(page.locator("[data-scene-slot] svg")).toBeVisible();
  const running = await page.evaluate(
    () =>
      document
        .querySelector("[data-scene-slot]")!
        .getAnimations({ subtree: true }).length,
  );
  expect(running).toBe(0);
});

test("the scene moves by default, and Today passes axe in every scene", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.goto("/today?scene=morning");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector("[data-scene-slot]")!
            .getAnimations({ subtree: true }).length,
      ),
    )
    .toBeGreaterThan(0);
  for (const scene of scenes) {
    await page.goto(`/today?scene=${scene}`);
    await expect(page.locator("[data-scene-slot] svg")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations, scene).toEqual([]);
  }
});

// Review captures: SCENE_SHOTS=1 npx playwright test scenes.spec.ts
test("review captures of every scene and style", async ({ page }) => {
  test.skip(!process.env.SCENE_SHOTS, "captures only on request");
  await startAsGuest(page);
  for (const [w, h] of [
    [320, 800],
    [390, 800],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    for (const style of ["Flat", "Ink line"]) {
      await page.goto("/today?scene=morning");
      const saved = page.waitForResponse(
        (r) => r.request().method() === "POST",
      );
      await page.getByRole("radio", { name: style }).click();
      await saved;
      for (const scene of scenes) {
        await page.goto(`/today?scene=${scene}`);
        await page.locator("[data-scene-slot] svg").waitFor();
        await page.addStyleTag({
          content: "*{animation:none!important;transition:none!important}",
        });
        await page.locator("section[aria-label='Today']").screenshot({
          path: `review-artifacts/v3-a5/${scene}-${style === "Flat" ? "flat" : "ink"}-${w}.png`,
        });
      }
    }
  }
});
