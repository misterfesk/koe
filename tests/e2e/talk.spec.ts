import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { entry, noHorizontalScroll, startAsGuest } from "./helpers";

// Talk answers from a script here (KOE_AI_STUB, local servers only), so the
// real cards, checks and confirm actions run without a model.
test.use({ permissions: ["notifications"] });

async function clean(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`),
  ).toEqual([]);
  await noHorizontalScroll(page);
}

async function say(page: Page, text: string) {
  await page.getByLabel("Your message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

/** The title of the entry the stub resolves "my walk" to: the movement item, else the first. */
async function walkTitle(page: Page) {
  await page.goto("/today");
  const titles = await page
    .getByRole("heading", { level: 3 })
    .allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  return titles.find((t) => /walk|stretch/i.test(t)) ?? titles[0];
}

test("Talk acts: a move request becomes a card, and Confirm changes Today", async ({
  page,
}) => {
  await startAsGuest(page);
  const title = await walkTitle(page);

  await page.goto("/talk");
  await say(page, "can you move my walk to 5pm");
  await expect(page).toHaveURL(/\/talk\/.+/);
  const card = page.getByRole("group", { name: "Move to a different time" });
  await expect(card).toBeVisible();
  await expect(card.getByText(`${title} to 5:00 pm`)).toBeVisible();
  // Koe asks; it has not done anything yet.
  await expect(page.getByText("I can move it. Want me to?")).toBeVisible();
  await clean(page, "talk card");

  // Nothing changed until Confirm.
  await page.goto("/today");
  await expect(entry(page, title).getByText("5:00 pm")).toHaveCount(0);

  await page.goBack();
  await page.getByRole("button", { name: "Move to 5:00 pm" }).click();
  await expect(
    page.getByText("Moved to 5:00 pm. You can undo it on Today."),
  ).toBeVisible();

  await page.goto("/today");
  await expect(entry(page, title).getByText("5:00 pm")).toBeVisible();

  // Opening the conversation again shows the card as done, not asking again.
  await page.goto("/talk");
  await page.getByRole("link", { name: /move my walk/ }).click();
  await expect(
    page.getByText("Moved to 5:00 pm. You can undo it on Today."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move to 5:00 pm" }),
  ).toHaveCount(0);
});

test("No thanks on a reminder card leaves no reminder", async ({ page }) => {
  await startAsGuest(page);
  await walkTitle(page);

  await page.goto("/talk");
  await say(page, "remind me about my walk");
  const card = page.getByRole("group", { name: "Reminder" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/^Remind you about/)).toBeVisible();
  await clean(page, "reminder card");

  await card.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByText("Okay, nothing changed.")).toBeVisible();

  await page.goto("/you/reminders");
  await expect(page.getByText(/^Reminder at/)).toHaveCount(0);
  await page.goto("/today");
  await expect(page.getByText(/^Reminder at/)).toHaveCount(0);
  await expect(page.getByText(/^Next reminder/)).toHaveCount(0);
});

test("a search card shows the exact words it would use", async ({ page }) => {
  await startAsGuest(page);
  await page.goto("/talk");
  await say(page, "find me something to read about sleep");
  const card = page.getByRole("group", { name: "Look for something to read" });
  await expect(
    card.getByText(
      "Koe would search for: “sleep and low mood practical guide article”.",
      { exact: false },
    ),
  ).toBeVisible();
  await clean(page, "search card");
  await card.getByRole("button", { name: "Look for this" }).click();
  await expect(
    page.getByText("Koe will look for this and put it on your Shelf."),
  ).toBeVisible();
});

test("a rough morning is listened to, with no card", async ({ page }) => {
  await startAsGuest(page);
  await page.goto("/talk");
  await say(page, "I had a rough morning");
  await expect(page.getByText("That sounds like a hard start.")).toBeVisible();
  await expect(page.getByRole("button", { name: "No thanks" })).toHaveCount(0);
});
