import { test, expect } from "../fixtures";

const PAGES = ["/swap", "/explore", "/book", "/my", "/create", "/launch", "/arbitrage", "/demo"];

test("every main page has a 'How this page works' box that opens and links to the explainer", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p);
    const box = page.getByTestId("explain");
    await expect(box, p).toBeVisible({ timeout: 30_000 });
    await box.locator("summary").click();
    await expect(box.locator("li").first(), p).toBeVisible();
    await expect(box.getByRole("link"), p).toHaveAttribute("href", /docs\/explained\.md#/);
  }
});
