import { test, expect, injectWallet, connect, switchAccount, ACCOUNTS } from "../fixtures";

test("browser wallet: switching accounts in the wallet updates the app; disconnecting there disconnects here", async ({ page }) => {
  await injectWallet(page, ACCOUNTS.trader);
  await page.goto("/swap");
  await connect(page);
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  await expect(page.locator("header").getByText(short(ACCOUNTS.trader))).toBeVisible();
  await switchAccount(page, ACCOUNTS.arber);
  await expect(page.locator("header").getByText(short(ACCOUNTS.arber))).toBeVisible();
  await expect(page.locator("header").getByText(short(ACCOUNTS.trader))).toHaveCount(0);
  await switchAccount(page, "");
  await expect(page.locator("header").getByRole("button", { name: "Connect" })).toBeVisible();
});
