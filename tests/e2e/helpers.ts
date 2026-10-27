import { expect, type Page } from "@playwright/test";

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
