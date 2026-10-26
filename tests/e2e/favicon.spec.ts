import { test, expect } from "./guards";
test("browser icon is local and served without an implicit 404", async ({
  page,
}) => {
  const response = await page.request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/image\//);
  await page.goto("/today");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute(
    "href",
    /favicon\.ico/,
  );
});
