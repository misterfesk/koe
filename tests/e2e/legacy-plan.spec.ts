import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { entry, noHorizontalScroll, startAsGuest } from "./helpers";

async function capture(page: Page, name: string, project: string) {
  await mkdir("review-artifacts/s7a", { recursive: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noHorizontalScroll(page);
    await page.screenshot({
      path: `review-artifacts/s7a/${project}-${name}-${width}.png`,
      fullPage: true,
    });
  }
}

test("old entry links reach current actions or read-only history, with owner checks", async ({
  page,
  browser,
}, info) => {
  await startAsGuest(page);
  // The first entry can already be visible without any fragment positioning.
  // Use a later entry so a failed post-hydration scroll cannot pass unnoticed.
  const secondTitle = await page
    .getByRole("heading", { level: 3 })
    .nth(1)
    .textContent();
  const second = entry(page, secondTitle!);
  const currentId = (await second.getAttribute("id"))!.slice("entry-".length);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/steps/" + currentId);
    await expect(page).toHaveURL(new RegExp("/today#entry-" + currentId + "$"));
    const current = page.locator("#entry-" + currentId);
    await expect
      .poll(async () => (await current.boundingBox())?.y ?? Infinity)
      .toBeLessThan(150);
    expect((await current.boundingBox())!.y).toBeGreaterThanOrEqual(64);
    const notToday = current.getByRole("button", {
      name: "Not today",
      exact: true,
    });
    await expect(notToday).toBeInViewport();
    await notToday.click();
    await expect(
      current.getByRole("button", { name: "Swap for something else" }),
    ).toBeEnabled();
    await current.getByRole("button", { name: "Keep it", exact: true }).click();
  }
  await capture(page, "current-anchor", info.project.name);

  await page.goto("/today/add");
  await page.getByLabel("What is it?").fill("Water the plants");
  await page.getByRole("button", { name: "Add to today" }).click();
  const added = entry(page, "Water the plants");
  await expect(added).toBeVisible();
  const id = (await added.getAttribute("id"))!.slice("entry-".length);
  await page
    .getByRole("region", { name: "What changed" })
    .getByRole("button", { name: "Undo" })
    .click();
  await page.goto("/steps/" + id);
  await expect(page).toHaveURL(new RegExp("/you/look-back/entry/" + id + "$"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Water the plants" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Make it smaller|Plan it again|Delete/ }),
  ).toHaveCount(0);
  await capture(page, "old-detail", info.project.name);
  const other = await browser.newContext({
    baseURL: new URL("/", page.url()).href,
  });
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(new URL("/", page.url()).href);
    await startAsGuest(otherPage);
    await otherPage.goto(new URL("/steps/" + id, page.url()).href);
    await expect(
      otherPage.getByRole("heading", { level: 1, name: "This isn't here" }),
    ).toBeVisible();
    await expect(otherPage.getByText("Water the plants")).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("add and problem drafts survive a way out, and People hands off to Today", async ({
  page,
}, info) => {
  await startAsGuest(page);
  await page.goto("/steps/new");
  await page.getByLabel("What is it?").fill("Water the plants");
  await capture(page, "add-form", info.project.name);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.goto("/today/add");
  await expect(page.getByLabel("What is it?")).toHaveValue("Water the plants");
  await page.goto("/steps/problem");
  await page.getByLabel("What's the problem?").fill("The bus leaves too early");
  await page.getByRole("button", { name: "Next: options" }).click();
  await page.getByLabel("Option 1").fill("Lay out clothes");
  await capture(page, "problem-options", info.project.name);
  await page.getByRole("link", { name: "Back to Today" }).click();
  await page.goto("/today/problem");
  await expect(page.getByLabel("Option 1")).toHaveValue("Lay out clothes");
  await page.getByRole("button", { name: "Next: choose one" }).click();
  await page.getByRole("button", { name: "Next: plan it" }).click();
  await expect(page.getByLabel("What is it?")).toHaveValue("Lay out clothes");
  await capture(page, "problem-plan", info.project.name);

  await page.goto("/you/people");
  await page.getByRole("button", { name: "Write it myself" }).click();
  await page.getByLabel("Your message").fill("Could you call later?");
  await page
    .getByRole("button", { name: "Add this to today", exact: true })
    .click();
  await capture(page, "people-plan", info.project.name);
  await page.getByRole("button", { name: "Add to today", exact: true }).click();
  await expect(
    page.getByText("Added to today. Your message stays here."),
  ).toBeVisible();
  await expect(page.getByLabel("Your message")).toHaveValue(
    "Could you call later?",
  );
  await page.getByRole("link", { name: /See today's plan/ }).click();
  await expect(entry(page, "Send someone a message")).toBeVisible();
  await page
    .getByRole("region", { name: "What changed" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Send someone a message" }),
  ).toHaveCount(0);
});
