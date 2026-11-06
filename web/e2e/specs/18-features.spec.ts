import { test, expect, injectWallet, connect, ACCOUNTS, deployments, shot } from "../fixtures";
import type { Page } from "@playwright/test";

/** Swap through the Swap screen; clicks through faucet / approve / swap as the button asks. */
async function swap(page: Page, amount: string) {
  await page.goto("/swap");
  await page.getByTestId("swap-amount").fill(amount);
  const cta = page.getByTestId("swap-cta");
  for (let i = 0; i < 4; i++) {
    await expect(cta).toHaveText(/Swap on|Approve|Get test/, { timeout: 30_000 });
    const label = await cta.innerText();
    await cta.click();
    if (/^Swap on/.test(label)) return;
    await expect(cta).not.toHaveText(label, { timeout: 60_000 });
  }
  throw new Error("swap did not reach the swap step");
}

test("features: move the market, trade receipt, fees and volume charts, explore sparklines", async ({ page }) => {
  test.setTimeout(240_000);
  const d = deployments();

  // Book: drag ETH's price; traders act and the wallet earns a fee
  await injectWallet(page, ACCOUNTS.trader);
  await page.goto(`/book?index=${d.demoHook}`);
  await connect(page);
  const mm = page.getByTestId("move-market");
  await expect(mm).toBeVisible({ timeout: 60_000 });
  await mm.getByTestId("market-slider").fill("1.5");
  await expect(mm.getByTestId("market-effects")).toContainText(/sell the wallet|buy/);
  await expect.poll(async () => Number((await mm.getByTestId("market-fee").innerText()).replace(/[$,]/g, ""))).toBeGreaterThan(0);
  await expect(mm.locator("line.chart-mark")).toHaveCount(1);
  await mm.scrollIntoViewIfNeeded();
  await mm.screenshot({ path: "e2e/artifacts/25-move-market.png" });

  // Swap: a real trade ends with a receipt that compares the other venue's quote
  await swap(page, "250");
  const receipt = page.getByTestId("trade-receipt");
  await expect(receipt).toBeVisible({ timeout: 90_000 });
  await expect(receipt.getByTestId("receipt-gap")).toHaveText("0 wei apart");
  await expect(receipt.getByTestId("receipt-got")).toContainText(/\d/);
  await receipt.screenshot({ path: "e2e/artifacts/26-receipt.png" });

  // Explore: each index card shows fills, fees and a sparkline of its fill prices
  await page.goto("/explore");
  const stats = page.getByTestId("explore-stats").first();
  await expect(stats).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("svg.spark").first()).toBeVisible({ timeout: 60_000 });
  await shot(page, "27-explore-stats");

  // My index (as the demo maker): fees per venue over time and volume by venue
  await page.close();
});

test("features: the maker sees fees and volume charts", async ({ page }) => {
  test.setTimeout(120_000);
  const d = deployments();
  await injectWallet(page, d.demoMaker);
  await page.goto("/my");
  await connect(page);
  await expect(page.getByTestId("fees-chart")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("volume-chart")).toBeVisible();
  await expect(page.getByTestId("volume-chart").locator("svg path")).toHaveCount(2);
  const grid = page.locator(".grid.g2", { has: page.getByTestId("fees-chart") });
  await grid.scrollIntoViewIfNeeded();
  await grid.screenshot({ path: "e2e/artifacts/28-fees-volume.png" });
});
