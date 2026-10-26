import type { Page } from "@playwright/test";
import { test, expect } from "./guards";

async function feature(page: Page, name: string) {
  await page
    .getByRole("link", { name: "Review explorer", exact: true })
    .click();
  await page
    .locator("main")
    .getByRole("link", { name: new RegExp(name) })
    .click();
}

test("a conversation draft and its memory provenance survive stopping and resuming", async ({
  page,
}) => {
  await page.goto("/settings/memory");
  await page
    .getByLabel("New card", { exact: true })
    .fill("Books near the chair");
  await page
    .getByRole("button", { name: "Keep this card", exact: true })
    .click();
  await feature(page, "Scripted conversation");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue the script", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, show a suggestion", exact: true })
    .click();
  const draft = page.getByLabel("Your step", { exact: true });
  await draft.fill("Read the book already beside the chair");
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page
    .getByRole("button", { name: "Pick up where you left off", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue the script", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, show a suggestion", exact: true })
    .click();
  await expect(draft).toHaveValue("Read the book already beside the chair");

  await page
    .getByRole("button", { name: "Use the suggestion as written", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Replace this step draft?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(draft).toHaveValue("Read the book already beside the chair");
  await page
    .getByRole("button", { name: "Choose this step", exact: true })
    .click();
  await feature(page, "F03");
  await page.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(
    page.getByLabel("Also delete 1 step chosen from this card", {
      exact: true,
    }),
  ).not.toBeChecked();
});

test("replacing a conversation draft is an explicit confirmed choice", async ({
  page,
}) => {
  await page.goto("/reflect/conversation");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByLabel("Your words", { exact: true })
    .fill("Keep these conversation words");
  await page
    .getByRole("button", { name: "Continue the script", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, show a suggestion", exact: true })
    .click();
  const draft = page.getByLabel("Your step", { exact: true });
  const suggestion = await draft.inputValue();
  await draft.fill("An edited draft");
  await page
    .getByRole("button", { name: "Use the suggestion as written", exact: true })
    .click();
  await expect(draft).toHaveValue("An edited draft");
  await page
    .getByRole("button", {
      name: "Yes, use the suggestion as written",
      exact: true,
    })
    .click();
  await expect(draft).toHaveValue(suggestion);
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Discard this conversation draft?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await page
    .getByRole("button", { name: "Pick up where you left off", exact: true })
    .click();
  await expect(page.getByLabel("Your words", { exact: true })).toHaveValue(
    "Keep these conversation words",
  );
  await page.getByRole("button", { name: "Stop here", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, discard draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
});

test("routine deletion asks first and changing kind keeps authored words", async ({
  page,
}) => {
  await page.goto("/steps/routines");
  await page
    .getByLabel("Your routine", { exact: true })
    .fill("My comfortable routine");
  await page.getByLabel("Kind", { exact: true }).selectOption("movement");
  await expect(page.getByLabel("Your routine", { exact: true })).toHaveValue(
    "My comfortable routine",
  );
  await page
    .getByRole("button", { name: "Choose this routine", exact: true })
    .click();
  await feature(page, "F15");
  await page
    .getByRole("button", { name: "Delete routine", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My comfortable routine", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete routine", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Delete routine", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, delete routine", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My comfortable routine", exact: true }),
  ).toHaveCount(0);
});

test("Start over keeps the session until its reset is confirmed", async ({
  page,
}) => {
  await page.goto("/reflect/journal");
  await page
    .getByLabel("Note (optional)", { exact: true })
    .fill("Keep this note until reset");
  await page
    .getByRole("button", { name: "Add to journal", exact: true })
    .click();
  await feature(page, "F06");
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Start this session over?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await feature(page, "F12");
  await expect(
    page.getByText("Keep this note until reset", { exact: true }),
  ).toBeVisible();
  await feature(page, "F06");
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await page
    .getByRole("button", { name: "Yes, start over", exact: true })
    .click();
  await feature(page, "F12");
  await expect(
    page.getByText("Keep this note until reset", { exact: true }),
  ).toHaveCount(0);
});

test("thought and journal drafts require confirmation before discarding", async ({
  page,
}) => {
  await page.goto("/reflect/thoughts");
  await page.getByLabel("Situation", { exact: true }).fill("Words to keep");
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await expect(page.getByLabel("Situation", { exact: true })).toHaveValue(
    "Words to keep",
  );
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(page.getByLabel("Situation", { exact: true })).toHaveValue(
    "Words to keep",
  );
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, discard draft", exact: true })
    .click();
  await expect(page.getByLabel("Situation", { exact: true })).toHaveValue("");
  await feature(page, "F12");
  await page
    .getByLabel("Note (optional)", { exact: true })
    .fill("Journal draft");
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await expect(page.getByLabel("Note (optional)", { exact: true })).toHaveValue(
    "Journal draft",
  );
  await page
    .getByRole("button", { name: "Yes, discard draft", exact: true })
    .click();
  await expect(page.getByLabel("Note (optional)", { exact: true })).toHaveValue(
    "",
  );
});

test("discarding a note or memory edit keeps the saved original", async ({
  page,
}) => {
  await page.goto("/settings/memory");
  await page.getByLabel("New card", { exact: true }).fill("Original card");
  await page
    .getByRole("button", { name: "Keep this card", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  await page.getByLabel("Edit card", { exact: true }).fill("Unsaved card edit");
  await page.getByRole("button", { name: "Discard edit", exact: true }).click();
  await expect(page.getByLabel("Edit card", { exact: true })).toHaveValue(
    "Unsaved card edit",
  );
  await page
    .getByRole("button", { name: "Yes, discard edit", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original card", exact: true }),
  ).toBeVisible();
  await feature(page, "F12");
  await page
    .getByLabel("Note (optional)", { exact: true })
    .fill("Original note");
  await page
    .getByRole("button", { name: "Add to journal", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await page.getByLabel("Edit note", { exact: true }).fill("Unsaved note edit");
  await page.getByRole("button", { name: "Discard edit", exact: true }).click();
  await expect(page.getByLabel("Edit note", { exact: true })).toHaveValue(
    "Unsaved note edit",
  );
  await page
    .getByRole("button", { name: "Yes, discard edit", exact: true })
    .click();
  await expect(page.getByText("Original note", { exact: true })).toBeVisible();
});

test("weekly review keeps a separate smaller-version draft for each step", async ({
  page,
}) => {
  await page.goto("/steps/new");
  await page.getByLabel("Your step", { exact: true }).fill("Step A");
  await page
    .getByRole("button", { name: "Choose this step", exact: true })
    .click();
  await feature(page, "F07");
  await page.getByLabel("Your step", { exact: true }).fill("Step B");
  await page
    .getByRole("button", { name: "Choose this step", exact: true })
    .click();
  await feature(page, "F10");
  await page
    .getByLabel("Step", { exact: true })
    .selectOption({ label: "Step A" });
  await page.getByLabel("What next?", { exact: true }).selectOption("shrink");
  await page
    .getByLabel("Smaller version", { exact: true })
    .fill("Authored smaller A");
  await page
    .getByLabel("Step", { exact: true })
    .selectOption({ label: "Step B" });
  await expect(
    page.getByLabel("Smaller version", { exact: true }),
  ).not.toHaveValue("Authored smaller A");
  await page
    .getByLabel("Step", { exact: true })
    .selectOption({ label: "Step A" });
  await expect(page.getByLabel("Smaller version", { exact: true })).toHaveValue(
    "Authored smaller A",
  );
  await page
    .getByRole("button", { name: "Discard review draft", exact: true })
    .click();
  await expect(page.getByLabel("Smaller version", { exact: true })).toHaveValue(
    "Authored smaller A",
  );
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(page.getByLabel("Smaller version", { exact: true })).toHaveValue(
    "Authored smaller A",
  );
});
