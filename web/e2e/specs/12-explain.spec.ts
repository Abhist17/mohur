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

test("How page: the trade-flow strip shows both venues step by step, with the shared quote() highlighted", async ({ page }) => {
  await page.goto("/how");
  await page.getByText("What happens when someone trades").click();
  const flow = page.getByTestId("trade-flow");
  await expect(flow).toBeVisible();
  await expect(flow.locator(".flow-row")).toHaveCount(2);
  await expect(flow.locator(".flow-step.shared")).toHaveCount(2);
  await flow.scrollIntoViewIfNeeded();
  await flow.screenshot({ path: "e2e/artifacts/17-how-flow.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await flow.screenshot({ path: "e2e/artifacts/m-how-flow.png" });
});
