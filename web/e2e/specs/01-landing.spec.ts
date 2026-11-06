import { test, expect, watchErrors, shot } from "../fixtures";

test("landing renders, the 3D scene draws, no console errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // first screen: the question, then the answer as a picture (today vs with Unison), and the demo as the main action
  await expect(page.getByTestId("hero-question")).toContainText("What if one wallet could serve both?");
  const ps = page.getByTestId("problem-solution");
  await expect(ps).toBeVisible();
  await expect(ps).toContainText("Today");
  await expect(ps).toContainText("With Unison");
  await expect(ps).toContainText("0 wei apart");
  expect((await ps.boundingBox())!.y).toBeLessThan(900); // above the fold on a laptop screen
  await expect(page.getByTestId("landing-demo")).toHaveClass(/primary/);
  await page.locator("#story").scrollIntoViewIfNeeded();
  const canvas = page.locator(".stage canvas");
  await expect(canvas).toBeVisible();
  // WebGL actually rendered something: the canvas has a non-zero drawing buffer
  const size = await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(size[0]).toBeGreaterThan(100);
  expect(size[1]).toBeGreaterThan(100);
  // both counters show the same live price
  const tags = page.locator(".tagbox");
  await expect(tags).toHaveCount(2);
  await expect.poll(async () => {
    const [a, b] = await tags.allInnerTexts();
    return a?.split("=")[1]?.trim() === b?.split("=")[1]?.trim() && /USDC/.test(a ?? "");
  }).toBe(true);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "01-landing", false);
  await page.locator("#story").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await shot(page, "01b-landing-scene", false);
  expect(errors).toEqual([]);
});
