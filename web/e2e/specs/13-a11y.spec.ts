import { test, expect } from "../fixtures";

test("keyboard: skip link is the first tab stop and jumps to content; focus is visible; nav marks the current page", async ({ page }) => {
  await page.goto("/swap");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  // tab to a nav link: it gets a visible outline
  await page.goto("/swap");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).toBe("solid");
  await expect(page.locator('header nav[aria-label="Main"] a[aria-current="page"]')).toHaveText("Swap");
  // every image has alt text (decorative ones use alt="")
  const missing = await page.locator("img:not([alt])").count();
  expect(missing).toBe(0);
});
