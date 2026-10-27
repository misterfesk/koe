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

/** Chooses Today's first suggestion as a step for today. */
export async function chooseFirstSuggestion(page: Page) {
  await page
    .getByRole("button", { name: /Choose this step/ })
    .first()
    .click();
  const form = page.locator("form.plan-form");
  const title = await form.getByLabel("Your step").inputValue();
  await form.getByRole("button", { name: "Choose this step" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: title }),
  ).toBeVisible();
  return title;
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
