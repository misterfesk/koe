import { test as base, expect } from "@playwright/test";

/** Every test fails if a request leaves 127.0.0.1 or the page throws. */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, context }, use) => {
      const external: string[] = [];
      const errors: string[] = [];
      context.on("request", (request) => {
        const url = new URL(request.url());
        if (
          ["http:", "https:"].includes(url.protocol) &&
          url.hostname !== "127.0.0.1"
        )
          external.push(url.href);
      });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const intentional404 =
          ["/unknown-page", "/unknown-review-route"].some((path) =>
            message.location().url.endsWith(path),
          ) && message.text().includes("404");
        if (!intentional404) errors.push(message.text());
      });
      await use();
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
