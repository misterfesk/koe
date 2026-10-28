import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, startAsGuest } from "./helpers";

test("Shelf finds picks, saves, removes and undoes a choice after reload", async ({
  page,
}) => {
  await startAsGuest(page);
  await expect(
    page.getByRole("region", { name: "Shelf", exact: true }),
  ).toHaveCount(0);
  await page.goto("/shelf");
  const current = page.getByRole("region", { name: "This week's picks" });
  const saved = page.getByRole("region", { name: "Saved", exact: true });
  await expect(current.getByRole("listitem")).toHaveCount(3);
  await expect(
    page.getByRole("status").filter({ hasText: "Your picks are ready." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Picked from trusted health sites. Koe links out; it doesn't copy their pages.",
    ),
  ).toHaveCount(1);
  const first = current.getByRole("listitem").first();
  const title = (await first.getByRole("heading").textContent())!;
  await expect(first.locator("p").last()).not.toBeEmpty();
  const external = first.getByRole("link", { name: /^Open / });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");
  expect(new URL((await external.getAttribute("href"))!).protocol).toBe(
    "https:",
  );
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    saved.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(current.getByRole("listitem")).toHaveCount(2);
  await saved.getByRole("button", { name: "Not for me" }).click();
  await expect(saved.getByRole("listitem")).toHaveCount(0);
  await expect(
    page.getByText("Removed from your picks.").locator(".."),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    saved.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto("/today");
  const compact = page.getByRole("region", { name: "Shelf", exact: true });
  await expect(compact).toBeVisible();
  await compact.getByRole("link", { name: "View all" }).waitFor();
  await compact.getByRole("link", { name: "See this pick" }).first().click();
  await expect(page).toHaveURL(/\/shelf#pick-/);
  const target = page.locator(`[id="${new URL(page.url()).hash.slice(1)}"]`);
  await expect(target.getByRole("heading")).toBeInViewport();
  const headerBottom = await page
    .locator("header")
    .first()
    .evaluate((el) => el.getBoundingClientRect().bottom);
  expect(
    (await target.getByRole("heading").boundingBox())!.y,
  ).toBeGreaterThanOrEqual(headerBottom);
});

test("Shelf picks and saved controls fit 320 and 390 pixels and pass axe", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.goto("/shelf");
  await expect(
    page
      .getByRole("region", { name: "This week's picks" })
      .getByRole("listitem"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(
    page
      .getByRole("region", { name: "Saved", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(1);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await noHorizontalScroll(page);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    // The pointer reaches the real controls at narrow widths.
    await page
      .getByRole("region", { name: "Saved", exact: true })
      .getByRole("button", { name: "Not for me" })
      .click();
    await expect(page.getByText("Removed from your picks.")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Saved", exact: true })
        .getByRole("listitem"),
    ).toHaveCount(1);
  }
});

test("Shelf announces loading after render and a failed search stays usable", async ({
  page,
}) => {
  await startAsGuest(page);
  let searchRequests = 0;
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/shelf", async (route) => {
    if (route.request().headers()["next-action"]) {
      searchRequests++;
      await paused;
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/shelf");
  await expect(page.getByText("Looking for a few good reads…")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Shelf" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("Search is unavailable. Check back later."),
  ).toBeVisible();
  await expect(
    page.getByText("No saved picks to show.", { exact: false }),
  ).toBeVisible();
  expect(searchRequests).toBe(1);
  await page
    .getByRole("region", { name: "This week's picks" })
    .getByRole("link", { name: "Talk", exact: true })
    .click();
  await expect(page).toHaveURL(/\/talk$/);
});
