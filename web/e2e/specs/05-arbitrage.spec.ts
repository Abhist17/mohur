import { test, expect, injectWallet, connect, ACCOUNTS, shot } from "../fixtures";

test("arbitrage me: a 3-leg cross-venue loop returns exactly its quote, and loses", async ({ page }) => {
  await injectWallet(page, ACCOUNTS.arber);
  await page.goto("/arbitrage");
  await connect(page);
  // default route: ETH -(Uniswap)-> USDC -(1inch)-> BTC -(Uniswap)-> ETH
  const loss = page.getByTestId("arb-loss");
  await expect(loss).toBeVisible();
  expect(Number(await loss.getAttribute("data-bps"))).toBeGreaterThan(0);
  const run = page.getByTestId("arb-run");
  await expect(run).toBeEnabled();
  await run.click();
  const result = page.getByTestId("arb-result");
  await expect(result).toBeVisible({ timeout: 120_000 });
  await expect(result).toHaveAttribute("data-match", "true");
  expect(BigInt((await result.getAttribute("data-out"))!)).toBeLessThan(BigInt((await result.getAttribute("data-in"))!));
  await shot(page, "05-arbitrage");
});
