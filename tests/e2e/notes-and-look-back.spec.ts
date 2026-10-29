import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, startAsGuest } from "./helpers";

test("Look back parked placeholder and Notes flow on desktop (1440) and mobile (375)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "viewport loop tests both sizes");
  await mkdir("review-artifacts/look-back-v3", { recursive: true });

  await startAsGuest(page);

  // 1. Look back parked placeholder at desktop (1440) and mobile (375)
  for (const [w, h] of [
    [1440, 900],
    [375, 812],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/you/look-back");
    await expect(
      page.getByRole("heading", { level: 1, name: "Look back" }),
    ).toBeVisible();
    await expect(
      page.getByText("Reflecting on your days is coming soon."),
    ).toBeVisible();
    await expect(page.locator("[data-look-back-parked] svg")).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({
      path: `review-artifacts/look-back-v3/look-back-${w}.png`,
      fullPage: true,
    });
  }

  // 2. Legacy / subroute redirects
  await page.goto("/you/look-back/journey");
  await expect(page).toHaveURL(/\/you\/look-back$/);
  await expect(page.locator("[data-look-back-parked]")).toBeVisible();

  await page.goto("/steps/non-existent-id");
  await expect(page).toHaveURL(/\/today$/);

  // 3. Notes (/you/notes): composer, list newest first, inline edit, delete with confirm
  for (const [w, h] of [
    [1440, 900],
    [375, 812],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/you/notes");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    await noHorizontalScroll(page);
  }

  // Set to desktop 1440 for creating and verifying notes
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/you/notes");

  // Create Note 1
  await page
    .getByLabel("Write a note")
    .fill("First note: morning stretch and walk");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Note 1 appears in the saved list
  await expect(
    page.getByRole("heading", { level: 2, name: "Saved notes" }),
  ).toBeVisible();
  await expect(
    page.getByText("First note: morning stretch and walk"),
  ).toBeVisible();

  // Create Note 2
  await page
    .getByLabel("Write a note")
    .fill("Second note: evening reading chapter 4");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Both appear, newest first: Note 2 before Note 1
  const noteTexts = await page.locator(".note-text").allInnerTexts();
  expect(noteTexts.length).toBeGreaterThanOrEqual(2);
  expect(noteTexts[0]).toBe("Second note: evening reading chapter 4");
  expect(noteTexts[1]).toBe("First note: morning stretch and walk");

  // Test mobile (375) layout with populated notes
  await page.setViewportSize({ width: 375, height: 812 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "review-artifacts/look-back-v3/notes-mobile-375.png",
    fullPage: true,
  });

  // Test desktop (1440) screenshot
  await page.setViewportSize({ width: 1440, height: 900 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "review-artifacts/look-back-v3/notes-desktop-1440.png",
    fullPage: true,
  });

  // Edit Note 1 inline
  const note1Card = page.locator("[data-note-id]").nth(1);
  await note1Card.getByRole("button", { name: "Edit" }).click();
  const editArea = note1Card.locator("textarea.inline-edit");
  await expect(editArea).toBeVisible();
  await editArea.fill("First note: morning stretch and quiet meditation");
  await note1Card.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("First note: morning stretch and quiet meditation"),
  ).toBeVisible();

  // Delete Note 2 with confirmation
  const note2Card = page.locator("[data-note-id]").first();
  await note2Card.getByRole("button", { name: "Delete note" }).click();
  await expect(page.getByText("Delete this note?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, delete note" }).click();

  // Verify Note 2 is gone and Note 1 remains
  await expect(
    page.getByText("Second note: evening reading chapter 4"),
  ).toHaveCount(0);
  await expect(
    page.getByText("First note: morning stretch and quiet meditation"),
  ).toBeVisible();
});
