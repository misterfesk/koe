import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { noHorizontalScroll } from "./helpers";

/** Opens the welcome dialog and starts, stopping on the intake. */
async function startIntake(page: Page) {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Welcome to Koe" });
  await dialog.getByLabel("I'm 18 or older").check();
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/intake$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Five questions so Koe can plan your day",
    }),
  ).toBeVisible();
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

const chip = (page: Page, name: string) =>
  page.locator("label.chip", { hasText: name }).first();
const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const begin = (page: Page) =>
  page.getByRole("button", { name: "Start", exact: true }).click();
const skip = (page: Page) =>
  page.getByRole("button", { name: "Skip", exact: true }).click();

test("welcome, five questions, reveal and Start my day land on Today", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startIntake(page);
  await clean(page, "intro");
  await begin(page);

  // 1. Goals: up to two.
  await expect(heading(page, "What would help most right now?")).toBeFocused();
  await expect(page.getByText("1 of 5")).toBeVisible();
  await chip(page, "Energy and motivation").click();
  await chip(page, "Sleep").click();
  await expect(
    page.getByRole("checkbox", { name: "Looking after the basics" }),
  ).toBeDisabled();
  await clean(page, "q1");
  await page.getByRole("button", { name: "Next" }).click();

  // 2. A usual day.
  await expect(heading(page, "What does a usual day look like?")).toBeVisible();
  await expect(page.getByText("2 of 5")).toBeVisible();
  await chip(page, "Between 7 and 9").click();
  await chip(page, "Working").click();
  await chip(page, "Morning").click();
  await clean(page, "q2");
  await page.getByRole("button", { name: "Next" }).click();

  // 3. What used to lift.
  await expect(heading(page, /What used to lift you/)).toBeVisible();
  await chip(page, "Music").click();
  await chip(page, "Walking").click();
  await page.getByLabel("Add a few words (optional)").fill("Old records");
  await clean(page, "q3");
  await page.getByRole("button", { name: "Next" }).click();

  // 4. Skipped.
  await expect(heading(page, "Who's in your corner?")).toBeVisible();
  await clean(page, "q4");
  await skip(page);

  // 5. Tone and morning plan.
  await expect(heading(page, "How should Koe be with you?")).toBeVisible();
  await chip(page, "Gentle").click();
  await chip(page, "8:00 am").click();
  await clean(page, "q5");
  // The server actions are slowed down, so the wait screen is on screen long
  // enough to be seen: it must show while the reveal is being made.
  let slowed = false;
  await page.route("**/*", async (route) => {
    if (!slowed && route.request().headers()["next-action"]) {
      slowed = true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(heading(page, "Getting to know you…")).toBeVisible();
  await expect(page.getByText("Putting your answers together")).toBeVisible();

  // The reveal.
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await expect(page.getByText("Here's a simple start")).toBeVisible();
  await clean(page, "reveal");
  const summary = page.getByLabel(/You can change this/);
  await expect(summary).toHaveValue(/^You/);
  const items = page.locator("ol li");
  await expect(items).toHaveCount(3);
  for (const li of await items.all()) {
    await expect(li.getByRole("heading", { level: 3 })).toBeVisible();
    await expect(li.getByText(/^Because/)).toBeVisible();
    await expect(li.locator(".eyebrow")).toHaveText(
      /^\d{1,2}:\d\d( [ap]m)? · (Tiny|Small)$/,
    );
  }
  const titles = await items
    .getByRole("heading", { level: 3 })
    .allTextContents();

  // Swap one item for another of the same kind.
  await items.first().getByRole("button", { name: /^Swap/ }).click();
  const swapped = await items
    .first()
    .getByRole("heading", { level: 3 })
    .textContent();
  expect(swapped).not.toBe(titles[0]);

  // Memory cards: visible, ticked, editable; untick one.
  const cards = page.getByRole("checkbox", { name: "Remember this" });
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toBeChecked();
  await expect(page.getByText("From your intro").first()).toBeVisible();
  await cards.nth(1).uncheck();
  const kept = await page.getByLabel("Memory 1").inputValue();

  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Today shows the three items with their times and reasons.
  const today = page.getByRole("heading", { level: 3 });
  await expect(today).toHaveCount(3);
  await expect(page.getByText(/^Because/)).toHaveCount(3);
  await expect(
    page.getByRole("heading", { level: 3, name: swapped! }),
  ).toBeVisible();
  await page.reload();
  await expect(today).toHaveCount(3);
  await expect(
    page.getByRole("heading", { level: 3, name: swapped! }),
  ).toBeVisible();

  // Only the ticked memory was kept, with its source.
  await page.goto("/you/knows");
  await expect(page.locator("p", { hasText: kept })).toBeVisible();
  await expect(page.getByText("From your intro", { exact: true })).toHaveCount(
    1,
  );

  // Someone who has done the intro does not see it again.
  await page.goto("/intake");
  await expect(page).toHaveURL(/\/today$/);

  // The export has what Koe knows.
  const res = await page.request.get("/api/export");
  const body = await res.json();
  expect(body.userModel.model.lifts).toEqual(["music", "walking"]);
  expect(body.planDays).toHaveLength(1);
  expect(body.memoryCards).toHaveLength(1);
});

test("a risky answer shows the safety flow and the intake carries on", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  await chip(page, "Sleep").click();
  await page
    .getByLabel("Add a few words (optional)")
    .fill("I want to end it all");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByRole("heading", { name: /are you safe right now/ }),
  ).toBeFocused();
  await clean(page, "safety");
  await page.getByRole("button", { name: "I'm safe for now" }).click();
  await page.getByRole("button", { name: "Carry on with Koe" }).click();
  await expect(heading(page, "What does a usual day look like?")).toBeVisible();
  // Back on the first question, the words are gone and the tick is kept.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Add a few words (optional)")).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: "Sleep" })).toBeChecked();
});

test("all questions skipped still gives a gentle first day", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  for (let n = 0; n < 5; n++) await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(3);
  // Removing items is allowed down to one.
  const remove = page.getByRole("button", { name: /^Remove/ });
  await remove.first().click();
  await remove.first().click();
  await expect(page.locator("ol li")).toHaveCount(1);
  await expect(remove.first()).toBeDisabled();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
});

test("food and weight worry drops food and movement and points to Help", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  await page
    .getByLabel("Add a few words (optional)")
    .fill("I hate my body and I'm restricting");
  await page.getByRole("button", { name: "Next" }).click();
  for (let n = 0; n < 4; n++) await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await expect(
    page.getByText(/tell a doctor or someone you trust/),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Help", exact: true }),
  ).toBeVisible();
  const text = await page.locator("ol").innerText();
  expect(text).not.toMatch(/\b(eat|meal|food|walk|stretch|exercise)/i);
});

test("the questions work at 320px and by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await startIntake(page);
  await noHorizontalScroll(page);
  await begin(page);
  await noHorizontalScroll(page);
  // Enter in a text box moves on, like Next.
  await page.getByLabel("Add a few words (optional)").fill("Just getting by");
  await page.getByLabel("Add a few words (optional)").press("Enter");
  await expect(heading(page, "What does a usual day look like?")).toBeVisible();
  // Chips are real controls: Space picks one.
  await page.getByRole("radio", { name: "Before 7" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Before 7" })).toBeChecked();
  await noHorizontalScroll(page);
  // One button: Next once something is answered, Skip when nothing is.
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next" }).click();
  for (let n = 0; n < 3; n++) await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await noHorizontalScroll(page);
  await clean(page, "reveal 320");
});

test("a reload picks up the intake where it was", async ({ page }) => {
  await startIntake(page);
  await begin(page);
  await chip(page, "Sleep").click();
  await page.getByLabel("Add a few words (optional)").fill("Mornings are hard");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(heading(page, "What does a usual day look like?")).toBeVisible();
  await chip(page, "Between 7 and 9").click();
  await page.reload();
  // Back on the second question, with the earlier answers kept.
  await expect(heading(page, "What does a usual day look like?")).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Between 7 and 9" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("checkbox", { name: "Sleep" })).toBeChecked();
  await expect(page.getByLabel("Add a few words (optional)")).toHaveValue(
    "Mornings are hard",
  );
  // Words that trip the safety check are never kept.
  await page
    .getByLabel("Add a few words (optional)")
    .fill("I want to end it all");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "I'm safe for now" }).click();
  await page.getByRole("button", { name: "Carry on with Koe" }).click();
  await page.reload();
  const kept = await page.evaluate(() =>
    window.sessionStorage.getItem("koe.intake.draft.v1"),
  );
  expect(kept).not.toContain("end it all");
});
