import { test, expect } from "./guards";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

const observations = new WeakMap<
  Page,
  { external: string[]; errors: string[] }
>();
test.beforeEach(({ page }) => {
  const current = { external: [] as string[], errors: [] as string[] };
  observations.set(page, current);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    )
      current.external.push(url.href);
  });
  page.on("pageerror", (error) => current.errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(observations.get(page)?.external).toEqual([]);
  expect(observations.get(page)?.errors).toEqual([]);
});

test("S4 conversation consent, explicit memory, plan and fresh deletion-aware ideas", async ({
  page,
}) => {
  await page.goto("/reflect/conversation");
  await expect(
    page.getByText(
      "Scripted preview. No live AI reads or responds to your words.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose this step", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByLabel("Your words").fill("A fictional day with little room.");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goBack();
  await expect(page.getByLabel("Your words")).toHaveValue(
    "A fictional day with little room.",
  );
  await page
    .getByRole("button", { name: "Continue the script", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Would a suggestion help?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose this step", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Yes, show a suggestion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose this step", exact: true })
    .click();
  await expect(page).toHaveURL(/\/steps\/step-\d+$/);
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await page.getByText("Keep a memory card", { exact: true }).click();
  await page.getByLabel("Memory card").fill("Reading a fictional poem");
  await page
    .getByRole("button", { name: "Keep this card", exact: true })
    .click();
  await page.getByRole("link", { name: "See Memory", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Reading a fictional poem",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  await page.getByLabel("Edit card").fill("Reading a fictional line");
  await page
    .getByRole("button", { name: "Save card changes", exact: true })
    .click();
  const memoryDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export cards (JSON)", exact: true })
    .click();
  const memoryFile = await memoryDownload;
  expect(memoryFile.suggestedFilename()).toBe("koe-synthetic-memory.json");
  const memoryPath = await memoryFile.path();
  if (!memoryPath) throw new Error("Memory export did not produce a file");
  const exportedMemory = JSON.parse(await readFile(memoryPath, "utf8"));
  expect(exportedMemory.cards[0]).toMatchObject({
    text: "Reading a fictional line",
    source: "Scripted conversation: explicit wording",
    at: "2026-10-25T12:00:00.000Z",
  });
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await expect(page.getByTestId("current-script-idea")).toContainText(
    "Reading a fictional line",
  );
  await page.getByRole("link", { name: "See Memory", exact: true }).click();
  await page.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Delete this memory card?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Yes, delete card", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Reading a fictional line",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await expect(page.getByTestId("current-script-idea")).not.toContainText(
    "Reading a fictional line",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `review-artifacts/s4/conversation-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("S4 thought draft, temporary memory permission, journal edit/delete/export and recovery", async ({
  page,
}) => {
  await page.goto("/reflect/thoughts");
  await page.getByLabel("Situation").fill("A fictional delayed train");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Thought").fill("This delay is inconvenient");
  // One button per prompt: "Next" when the field has words, "Skip" when blank.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish reflection", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reflection finished" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Reflection finished" }),
  ).toBeFocused();
  await page
    .getByLabel("A step in your words")
    .fill("Read a fictional timetable");
  await page
    .getByRole("button", { name: "Open in the step planner", exact: true })
    .click();
  await expect(page).toHaveURL(/\/steps\/new$/);
  await expect(page.getByLabel("Your step")).toHaveValue(
    "Read a fictional timetable",
  );
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await page
    .getByRole("link", { name: "Thought reflection", exact: true })
    .click();
  await page
    .getByLabel("A step in your words")
    .fill("A different proposed action");
  await page
    .getByRole("button", { name: "Open in the step planner", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "A step draft is already open in the planner",
  );
  await expect(
    page.getByRole("link", {
      name: "Open the step draft you already have",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Memory", exact: true }).click();
  await page
    .getByLabel("Temporary mode: don't keep or use memory cards")
    .check();
  await page.getByLabel("New card").fill("Must remain unapproved");
  await expect(
    page.getByRole("button", { name: "Keep this card", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await page.getByRole("link", { name: "Journal", exact: true }).click();
  await page.getByLabel("Energy right now").selectOption("low");
  await page.getByLabel("Note (optional)").fill("A fictional quiet afternoon");
  await page
    .getByRole("button", { name: "Add to journal", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await page.getByLabel("Edit note").fill("A fictional quiet evening");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("A fictional quiet evening", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `review-artifacts/s4/journal-${test.info().project.name}.png`,
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export notes (JSON)", exact: true })
    .click();
  const journalFile = await download;
  expect(journalFile.suggestedFilename()).toBe("koe-synthetic-journal.json");
  const journalPath = await journalFile.path();
  if (!journalPath) throw new Error("Journal export did not produce a file");
  const exportedJournal = JSON.parse(await readFile(journalPath, "utf8"));
  expect(exportedJournal.notes[0]).toMatchObject({
    text: "A fictional quiet evening",
    energy: "low",
  });
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Delete this note?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Yes, delete note", exact: true })
    .click();
  await expect(
    page.getByText("No notes yet. Your first one will appear here.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to Reflect", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByLabel("Your words")
    .fill("Keep this draft during an interruption");
  await page
    .getByRole("button", { name: "Preview an error (review)", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Error preview");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Your words")).toHaveValue(
    "Keep this draft during an interruption",
  );
  await page.getByRole("button", { name: "Stop here", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You can leave it here.", exact: true }),
  ).toBeVisible();
});

test("S4 offline, revoked memory and paused coaching have explicit boundaries", async ({
  page,
}) => {
  await page.goto("/review");
  await page.getByLabel("Fictional scenario").selectOption("provider offline");
  await page.locator('main a[href="/reflect/conversation"]').click();
  await expect(
    page.getByRole("heading", {
      name: "This preview is offline.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Help & support" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Turn the script back on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByLabel("Fictional scenario").selectOption("revoked consent");
  await page.locator('main a[href="/settings/memory"]').click();
  await expect(
    page.getByLabel("Let suggestions use memory cards"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Keep this card", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByLabel("Fictional scenario").selectOption("coaching paused");
  await page.locator('main a[href="/reflect/conversation"]').click();
  await expect(
    page.getByRole("heading", {
      name: "Ordinary coaching is paused.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/UX preview; not a validated safety response/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Scripted conversation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Journal", exact: true }),
  ).toBeVisible();
});
