import { test, expect, injectWallet, connect, ACCOUNTS } from "../fixtures";

test("gas hint: a wallet with no ETH is told how to get gas before any transaction", async ({ page }) => {
  const empty = "0x74656e62696e456d70747947617357616c657431" as const; // ascii 'tenbinEmptyGasWalet1': holds no ETH
  await injectWallet(page, empty);
  await page.goto("/demo");
  await connect(page);
  await expect(page.getByTestId("gas-hint")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("gas-hint")).toContainText("not enough for gas");
  for (const p of ["/swap", "/launch"]) {
    await page.goto(p);
    await expect(page.getByTestId("gas-hint"), p).toBeVisible({ timeout: 30_000 });
  }
});

test("gas hint stays hidden for a funded wallet", async ({ page }) => {
  await injectWallet(page, ACCOUNTS.trader);
  await page.goto("/swap");
  await connect(page);
  await expect(page.getByTestId("swap-cta")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("gas-hint")).toHaveCount(0);
});
