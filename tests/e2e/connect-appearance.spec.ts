import { test, expect } from "./guards";
import { readFile } from "node:fs/promises";
test("S5 reach out safely, copy without sending, adapt after no reply, prepare factual care export", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/connect");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reach out");
  await page.getByLabel("Who feels safe to contact?").selectOption("person");
  await page
    .getByLabel("Your message")
    .fill("Hi Alex, would you like a short chat?");
  await page.getByRole("button", { name: "Copy message", exact: true }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "Copied. Nothing was sent.",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Hi Alex, would you like a short chat?",
  );
  await page.getByText("After you reach out", { exact: true }).click();
  await page.getByLabel("How did it go?").selectOption("No reply");
  await page.getByRole("button", { name: "Save how it went" }).click();
  await expect(
    page.getByText("No reply does not tell you why.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try another approach" }).click();
  await expect(page.getByLabel("Who feels safe to contact?")).toHaveValue(
    "none",
  );
  await page.getByRole("link", { name: "Support options" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Reach a person who can help.",
  );
  await page.getByRole("link", { name: "Connect", exact: true }).click();
  await page.getByRole("link", { name: "Prepare for care" }).click();
  await page
    .getByLabel("Original notes")
    .fill("I would like to ask about access and cost.");
  await page
    .getByRole("button", { name: "Use notes as starting summary" })
    .click();
  await page
    .getByLabel("Editable factual summary")
    .fill("Ask about access, cost and a quiet appointment time.");
  await page.getByLabel("Check cost and access").check();
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export care preparation JSON" })
    .click();
  const file = await waiting;
  const path = await file.path();
  if (!path) throw new Error("Missing care export");
  const data = JSON.parse(await readFile(path, "utf8"));
  expect(data.originalNotes).toBe("I would like to ask about access and cost.");
  expect(data.editedSummary).toBe(
    "Ask about access, cost and a quiet appointment time.",
  );
  expect(data.checklist).toContain("Check cost and access");
  await expect(page.getByLabel("Original notes")).toHaveValue(
    "I would like to ask about access and cost.",
  );
});
test("S5 appearance changes the app and no-safe-person path remains pressure-free", async ({
  page,
}) => {
  await page.goto("/settings/appearance");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Appearance",
  );
  await expect(page.locator("[data-mascot]")).toBeVisible();
  await page.getByLabel("Voice").selectOption("plain");
  await page.getByLabel("Plain view").check();
  await page.getByLabel("Reduce motion").check();
  await expect(page.locator("[data-plain=true]")).toBeVisible();
  await expect(page.locator("[data-motion=reduced]")).toBeVisible();
  await expect(page.locator("[data-mascot]")).toHaveCount(0);
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Choose an optional step.",
  );
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByLabel("Fictional scenario").selectOption("no safe contact");
  await page.getByRole("link", { name: "Connect", exact: true }).click();
  await expect(page.getByLabel("Who feels safe to contact?")).toHaveValue(
    "none",
  );
  await expect(
    page.getByRole("link", { name: "Support options" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy message", exact: true }),
  ).toHaveCount(0);
});

test("S5 preserves drafts through Help and confirms replacement of an edited summary", async ({
  page,
}) => {
  await page.goto("/connect/care");
  await page
    .getByLabel("Original notes", { exact: true })
    .fill("Original words");
  await page.getByLabel("Editable factual summary").fill("My edited words");
  await page.getByRole("link", { name: "Help & support", exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goBack();
  await expect(page.getByLabel("Original notes", { exact: true })).toHaveValue(
    "Original words",
  );
  await expect(page.getByLabel("Editable factual summary")).toHaveValue(
    "My edited words",
  );
  await page
    .getByRole("button", { name: "Replace summary with notes", exact: true })
    .click();
  await expect(page.getByLabel("Editable factual summary")).toHaveValue(
    "My edited words",
  );
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(page.getByLabel("Editable factual summary")).toHaveValue(
    "My edited words",
  );
  await page
    .getByRole("button", { name: "Replace summary with notes", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Yes, replace summary with notes",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Editable factual summary")).toHaveValue(
    "Original words",
  );
  await expect(page.getByLabel("Original notes", { exact: true })).toHaveValue(
    "Original words",
  );
});

test("S5 empty copy focuses its own message and reduced motion follows the device", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/connect");
  await page.getByLabel("Who feels safe to contact?").selectOption("person");
  await page.getByLabel("Your message", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Copy message", exact: true }).click();
  await expect(page.getByLabel("Your message", { exact: true })).toBeFocused();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Write a message",
  );
  await expect(page.locator("[data-mascot]")).toBeVisible();
  expect(
    await page
      .locator("[data-mascot]")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("link", { name: "Help & support", exact: true }).click();
  await expect(page.locator("[data-mascot]")).toHaveAttribute(
    "data-mode",
    "calm",
  );
});
