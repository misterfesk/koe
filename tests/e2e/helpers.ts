import { expect, type Page } from "@playwright/test";

export async function intakeDraftText(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((key) =>
      key.startsWith("koe.plan-draft:intake:"),
    );
    return key
      ? sessionStorage.getItem(key)
      : sessionStorage.getItem("koe.intake.draft.v1");
  });
}

/** Starts a fresh guest session through the real welcome dialog, then skips the intake. */
export async function startAsGuest(page: Page, region = "SG") {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Welcome to Koe" });
  await dialog.getByLabel("I'm 18 or older").check();
  await dialog.getByLabel("Where are you?").selectOption(region);
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/intake$/);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

/** The title of the first entry on Today's timeline (the day is planned when Today opens). */
export async function firstEntryTitle(page: Page) {
  const heading = page.getByRole("heading", { level: 3 }).first();
  await expect(heading).toBeVisible();
  return (await heading.textContent())!;
}

/** The timeline card with this title. */
export const entry = (page: Page, title: string) =>
  page.locator("li", {
    has: page.getByRole("heading", { level: 3, name: title }),
  });

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Completes the deterministic interview after a first thing has been supplied. */
export async function proposeInterview(page: Page) {
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Where does it get stuck?");
  await page
    .getByLabel("Your answer")
    .fill("Choosing which words to use feels hard");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(title).toHaveText("What would finishing look like this week?");
  await page
    .getByLabel("Your answer")
    .fill("Only the opening paragraph is left");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(title).toHaveText(
    "Want to break this into pieces for the week?",
  );
  await page
    .getByRole("button", { name: "Break it down", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show the pieces", exact: true })
    .click();
  await expect(title).toHaveText("Your week, in smaller pieces");
}
