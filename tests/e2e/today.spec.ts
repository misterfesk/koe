import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  entry,
  noHorizontalScroll,
  proposeInterview,
  startAsGuest,
} from "./helpers";

/** Welcome dialog, then an intake that leaves one small item to shrink, then Today. */
async function startWithPlan(page: Page) {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Welcome to Koe" });
  await dialog.getByLabel("I'm 18 or older").check();
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/intake$/);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const chip = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await chip("Work or study").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await chip("Music").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Here's what I understood" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function titles(page: Page) {
  return page.getByRole("heading", { level: 3 }).allTextContents();
}

async function clean(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`),
  ).toEqual([]);
  await noHorizontalScroll(page);
}

test("the day plan: check-in, undo, answers, not today and letting go", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await startWithPlan(page);

  // A timeline with times, why lines and sizes, and the check-in at the top.
  const cards = page.locator("ul li", {
    has: page.getByRole("heading", { level: 3 }),
  });
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card.locator(".eyebrow")).toHaveText(
      /^\d{1,2}:\d\d (am|pm) · /,
    );
    await expect(card.getByText(/^Because /)).toBeVisible();
    await expect(card.getByText(/^(Tiny|Small|Medium)$/)).toBeVisible();
    await expect(card.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Partly" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Not today" })).toBeVisible();
  }
  await expect(page.getByText(/\bstep\b/i)).toHaveCount(0);
  const original = await titles(page);
  const times = await cards.locator(".eyebrow").allTextContents();
  expect(times).toHaveLength(3);

  // Check-in: low. The effect is visible, with a diff and Undo.
  await expect(page.getByText("How are you arriving today?")).toBeVisible();
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByLabel("One word, if you like").fill("tired");
  await page.getByRole("button", { name: "Update my day" }).click();
  const banner = page.getByRole("region", { name: "What changed" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Lighter day: Made");
  await expect(banner).not.toContainText(/\b(I|we|us)\b/);
  await expect(banner.getByRole("listitem")).toHaveCount(1);
  expect(await titles(page)).not.toEqual(original);
  // The question is gone; a chip stays.
  await expect(page.getByText("How are you arriving today?")).toHaveCount(0);
  await expect(page.getByText("Arrived: low · tired")).toBeVisible();

  // Accessibility and width with the banner on screen.
  await clean(page, "today with banner");

  // Undo puts the original titles back.
  await banner.getByRole("button", { name: "Undo" }).click();
  await expect(banner).toHaveCount(0);
  expect(await titles(page)).toEqual(original);
  await expect(page.getByText("Arrived: low · tired")).toBeVisible();

  // Done, then how it compared with what they expected.
  const first = entry(page, original[2]);
  await first.getByRole("button", { name: "Done" }).click();
  await expect(first.getByRole("status")).toContainText("Done");
  await first.getByRole("button", { name: "Better", exact: true }).click();
  await expect(first.getByRole("status")).toContainText(
    "Done · Better than expected",
  );

  // Not today on the small item: make it smaller.
  const small = page.locator("li", {
    has: page.getByText("Small", { exact: true }),
  });
  await expect(small).toHaveCount(1);
  const smallTitle = (await small
    .getByRole("heading", { level: 3 })
    .textContent())!;
  await small.getByRole("button", { name: "Not today" }).click();
  const sheet = small.getByRole("group", { name: "Not today" });
  await expect(sheet).toBeVisible();
  await clean(page, "today with sheet open");
  await sheet.getByRole("button", { name: "Make it smaller" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: smallTitle }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "What changed" }),
  ).toContainText("smaller");
  await expect(page.getByText("Small", { exact: true })).toHaveCount(0);
  const afterShrink = await titles(page);
  expect(afterShrink).toHaveLength(3);

  // Let it go for today on another entry.
  const letGo = afterShrink[1];
  const other = entry(page, letGo);
  await other.getByRole("button", { name: "Not today" }).click();
  await other
    .getByRole("group", { name: "Not today" })
    .getByRole("button", { name: "Let it go for today" })
    .click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(
    page.getByRole("heading", { level: 3, name: letGo }),
  ).toHaveCount(0);

  // Everything persists across a reload, and the check-in is not asked again.
  const now = await titles(page);
  await page.reload();
  expect(await titles(page)).toEqual(now);
  await expect(entry(page, original[2]).getByRole("status")).toContainText(
    "Done · Better than expected",
  );
  await expect(page.getByText("How are you arriving today?")).toHaveCount(0);
  await expect(page.getByText("Arrived: low · tired")).toBeVisible();

  // Add something of their own, small.
  await page.getByRole("button", { name: "Add something" }).click();
  await page.getByRole("button", { name: "Be kind to yourself" }).click();
  await page.getByLabel("What is it?").fill("Water the plants");
  await page.getByLabel("Time, if you have one").fill("17:30");
  await page.getByRole("button", { name: "Add to today" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Water the plants" }),
  ).toBeVisible();
  await expect(
    entry(page, "Water the plants").locator(".eyebrow"),
  ).toContainText("5:30 pm");
});

test("a changed answer plans again, and 'too much' lightens the day", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startWithPlan(page);
  await page
    .getByRole("main")
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page.getByRole("button", { name: "Update my day" }).click();
  await expect(page.getByText("Arrived: more")).toBeVisible();
  // Nothing was done yet, so nothing steps up, and that is said plainly.
  await expect(page.getByText("Your plan already fits today.")).toBeVisible();
  await expect(page.getByRole("region", { name: "What changed" })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Update my day" }).click();
  await expect(page.getByText("Arrived: low")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "What changed" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "This is too much today" }).click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(page.getByText(/Lighter day/)).toBeVisible();
  await page
    .getByRole("region", { name: "What changed" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
});

test("Today with the banner and the sheet open fits a 320px screen", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await startWithPlan(page);
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Update my day" }).click();
  await expect(
    page.getByRole("region", { name: "What changed" }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Not today" }).first().click();
  await page.getByRole("button", { name: "Move to later" }).click();
  await expect(page.getByRole("group", { name: "Move to" })).toBeVisible();
  await clean(page, "today 320");
});

test("a This week thing on Today is never made smaller or swapped", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await startAsGuest(page);
  await page.goto("/intake");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let n = 0; n < 4; n++)
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await page.getByLabel("Your answer").fill("Update the CV");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await proposeInterview(page);
  await page
    .getByRole("button", { name: "Save this week", exact: true })
    .click();
  await expect(page).toHaveURL(/\/today$/);

  // A low check-in re-plans the day from the week: one thing plus one anchor.
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Update my day" }).click();
  await expect(
    page.getByRole("region", { name: "What changed" }),
  ).toBeVisible();
  const thing = page
    .locator("li", {
      has: page.getByRole("heading", { level: 3, name: "Update the CV" }),
    })
    .filter({ has: page.getByRole("button", { name: "Not today" }) });
  await expect(thing).toHaveCount(1);
  await expect(
    thing.getByText('Because you said "Update the CV"'),
  ).toBeVisible();

  await thing.getByRole("button", { name: "Not today" }).click();
  // The sheet replaces the Not today button, so find it on the page (only one is open).
  const sheet = page.getByRole("group", { name: "Not today" });
  await expect(sheet.getByText("That is fine. What would help?")).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Move to later" }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Let it go for today" }),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Keep it" })).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Make it smaller" }),
  ).toHaveCount(0);
  await expect(
    sheet.getByRole("button", { name: "Swap for something else" }),
  ).toHaveCount(0);
  await sheet.getByRole("button", { name: "Let it go for today" }).click();
  await expect(thing).toHaveCount(0);
});
