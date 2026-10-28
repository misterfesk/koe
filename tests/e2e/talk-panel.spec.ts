import { expect, test, type Page } from "@playwright/test";
import { noHorizontalScroll, proposeInterview, startAsGuest } from "./helpers";

// Talk answers from a script here (KOE_AI_STUB, local servers only).
const desktop = { width: 1440, height: 1000 };

const opener = (page: Page) =>
  page.getByRole("button", { name: "Talk", exact: true });
const panel = (page: Page) => page.getByRole("dialog", { name: "Talk" });

test("the panel opens from Today and Shelf, and Today keeps its state", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAsGuest(page);
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByLabel("One word, if you like").fill("tired");

  await opener(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByText("Koe is an AI, not a person")).toBeVisible();
  await panel(page).getByRole("button", { name: "Close Talk" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByLabel("One word, if you like")).toHaveValue("tired");

  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Shelf" })
    .click();
  await expect(page).toHaveURL(/\/shelf$/);
  await opener(page).click();
  await expect(panel(page)).toBeVisible();
});

test("Escape closes the panel and focus returns to the Talk button", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAsGuest(page);
  await opener(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
});

test("History lists a conversation after a message is sent", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAsGuest(page);
  await opener(page).click();
  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();
  await expect(panel(page).getByText("No conversations yet.")).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();

  await panel(page).getByLabel("Your message").fill("hello there");
  await panel(page).getByRole("button", { name: "Send" }).click();
  await expect(panel(page).getByText("hello there")).toBeVisible();
  // The page behind did not navigate.
  await expect(page).toHaveURL(/\/today$/);

  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();
  await expect(
    panel(page).getByRole("heading", { name: "History" }),
  ).toBeVisible();
  await expect(panel(page).getByRole("listitem")).toHaveCount(1);
});

test("the phone bar has five items with Talk in the centre, and More opens a sheet", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout");
  await startAsGuest(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/today");
    const bar = page.getByRole("navigation", { name: "Main navigation" });
    expect(await bar.locator("a, button").allInnerTexts()).toEqual([
      "Today",
      "Shelf",
      "Talk",
      "You",
      "More",
    ]);
    await noHorizontalScroll(page);

    await bar.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link")).toHaveText([
      "Notes",
      "Look back",
      "People",
    ]);
    await noHorizontalScroll(page);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);

    await bar.getByRole("button", { name: "Talk" }).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("aria-modal", "true");
    await noHorizontalScroll(page);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Talk" })).toBeFocused();
  }
});

test("Stuck? Ask Koe opens Talk on a This week thing; Close leaves a takeaway in History", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize(desktop);
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
  // A check-in plans the day from the week.
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Update my day" }).click();
  await expect(
    page.getByRole("region", { name: "What changed" }),
  ).toBeVisible();

  const thing = page.locator("li", {
    has: page.getByRole("heading", { level: 3, name: "Update the CV" }),
  });
  await thing.getByRole("button", { name: "Stuck? Ask Koe →" }).click();
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByText(`What's getting in the way with "Update the CV"?`),
  ).toBeVisible();

  for (const said of ["I open it and close it", "the first line is hard"]) {
    await panel(page).getByLabel("Your message").fill(said);
    await panel(page).getByRole("button", { name: "Send" }).click();
    await expect(panel(page).getByText(said)).toBeVisible();
    await expect(panel(page).getByText("Thinking…")).toHaveCount(0);
  }
  await panel(page).getByRole("button", { name: "Close Talk" }).click();
  await expect(panel(page)).toHaveCount(0);

  await opener(page).click();
  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();
  await expect(
    panel(page).getByText("You named what gets in the way."),
  ).toBeVisible();
});
