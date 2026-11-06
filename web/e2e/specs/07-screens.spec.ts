import { test, expect, injectWallet, connect, ACCOUNTS, shot, watchErrors } from "../fixtures";

/** Screenshots of the remaining screens (for README / slides), each checked for content and console errors. */
test("screens: swap, explore, my index, how it works (light + dark)", async ({ page }) => {
  const errors = watchErrors(page);
  await injectWallet(page, ACCOUNTS.launcher); // launched an index in 03-launch
  await page.goto("/swap");
  await connect(page);
  await expect(page.getByTestId("venue-0")).toContainText(/\d/);
  await shot(page, "07-swap");

  await page.goto("/explore");
  await expect(page.getByRole("link", { name: "Trade" }).first()).toBeVisible();
  await shot(page, "08-explore");

  await page.goto("/my");
  await expect(page.getByText(/vs just holding/i).first()).toBeVisible();
  await shot(page, "09-my-index");

  await page.goto("/how");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "10-how");

  // dark theme variants of the two most-shown screens
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; localStorage.setItem("mohur-theme", "dark"); });
  await page.goto("/");
  await page.waitForTimeout(1500);
  await shot(page, "11-landing-dark", false);
  await page.goto("/book");
  await expect(page.getByTestId("quote-row")).toHaveCount(3);
  await shot(page, "12-book-dark");
  expect(errors).toEqual([]);
});
