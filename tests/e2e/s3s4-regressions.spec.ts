import { test, expect } from "./guards";

// Regressions for the independent S3/S4 review at 65ab457 (reviews/s3s4-65ab457.md).

test("V2: a reminder cannot be applied to a step deleted while it was drafted", async ({
  page,
}) => {
  await page.goto("/steps/routines");
  await page.getByLabel("Your routine").fill("Routine A");
  await page.getByRole("button", { name: "Choose this routine" }).click();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Routines/ }).click();
  await page.getByLabel("Your routine").fill("Routine B");
  await page.getByRole("button", { name: "Choose this routine" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Routine B");
  await page
    .getByRole("button", { name: "Preview a reminder", exact: true })
    .click();
  await page.getByLabel("Step").selectOption({ label: "Routine B" });
  await page.goBack();
  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await page
    .getByRole("button", { name: "Yes, delete step", exact: true })
    .click();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Reminder preview/ }).click();
  await expect(page.getByLabel("Step")).toHaveValue("");
  await page.getByLabel("Turn on a reminder preview").check();
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(
    page.getByText("Choose the step to be reminded about.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Step")).toBeFocused();
  await expect(page.getByText("Preview updated", { exact: false })).toHaveCount(
    0,
  );
});

test("V1: restoring memory consent keeps temporary mode on", async ({
  page,
}) => {
  await page.goto("/settings/memory");
  const temporary = page.getByLabel(
    "Temporary mode: don't keep or use memory cards",
  );
  const consent = page.getByLabel("Let suggestions use memory cards");
  await temporary.check();
  await consent.uncheck();
  await consent.check();
  await expect(temporary).toBeChecked();
});

test("V3/U1/U4a: conversation keeps the draft, names idea provenance and focuses the right place", async ({
  page,
}) => {
  await page.goto("/reflect/conversation");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .not.toBe("BODY");
  await page
    .getByRole("button", { name: "Continue the script", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, show a suggestion", exact: true })
    .click();
  const draft = page.getByLabel("Your step");
  const original = await draft.inputValue();
  expect(original).not.toBe("");
  await expect(page.getByTestId("idea-provenance")).toContainText(
    "A fixed example from the script",
  );

  await draft.fill("   ");
  await page
    .getByRole("button", { name: "Choose this step", exact: true })
    .click();
  await expect(draft).toBeFocused();

  await draft.fill(original);
  await page.getByText("Keep a memory card", { exact: true }).click();
  await page
    .getByRole("button", { name: "Keep this card", exact: true })
    .click();
  await expect(page.getByLabel("Memory card")).toBeFocused();

  await page.getByLabel("Memory card").fill("Short walks after lunch");
  await page
    .getByRole("button", { name: "Keep this card", exact: true })
    .click();
  await expect(page.getByTestId("current-script-idea")).toContainText(
    "Short walks after lunch",
  );
  await expect(page.getByTestId("idea-provenance")).toContainText(
    "Based on your memory card",
  );
  await expect(draft).toHaveValue(original);
  await expect(
    page.getByText("Your edited version below is kept unless you replace it."),
  ).toBeVisible();
});

test("U3: deleting a memory card asks first and Keep it returns focus", async ({
  page,
}) => {
  await page.goto("/settings/memory");
  await page.getByLabel("New card").fill("A fictional quiet corner");
  await page.getByRole("button", { name: "Keep this card" }).click();
  const remove = page.getByRole("button", { name: "Delete card", exact: true });
  await remove.click();
  await expect(
    page.getByRole("group", { name: "Delete this memory card?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(remove).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "A fictional quiet corner" }),
  ).toBeVisible();
});

test("free text typed across S3/S4 never reaches browser storage", async ({
  page,
  context,
}) => {
  const marker = "ZZ-private-marker-7731";
  await page.goto("/reflect/journal");
  await page.getByLabel("Note (optional)").fill(marker);
  await page.getByRole("button", { name: "Add to journal" }).click();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Thought reflection/ }).click();
  await page.getByLabel("Situation").fill(marker);
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page
    .getByRole("link", { name: /Approved memory|Memory/ })
    .first()
    .click();
  await page.getByLabel("New card").fill(marker);
  await page.getByRole("button", { name: "Keep this card" }).click();
  await expect(page.getByRole("heading", { name: marker })).toBeVisible();
  const stored = await page.evaluate(async () => {
    const dump = (s: Storage) =>
      Object.keys(s)
        .map((k) => k + "=" + s.getItem(k))
        .join(";");
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    const caches_ = "caches" in window ? await caches.keys() : [];
    return {
      local: dump(localStorage),
      session: dump(sessionStorage),
      dbs: dbs.map((d) => d.name),
      caches: caches_,
      cookie: document.cookie,
    };
  });
  expect(JSON.stringify(stored)).not.toContain(marker);
  expect(stored.dbs).toEqual([]);
  const cookies = await context.cookies();
  expect(JSON.stringify(cookies)).not.toContain(marker);
});
