import { test, expect, injectWallet, connect, chain, ACCOUNTS, shot } from "../fixtures";

// Runs after 03-launch: the launcher (#5) owns a live 40/30/30 index.
const rpc = (method: string, params: unknown[] = []) => chain.request({ method: method as never, params: params as never });
const weight = async (page: import("@playwright/test").Page, sym: string) =>
  Number(await page.getByTestId(`alloc-now-${sym}`).getAttribute("data-w"));

test("my index: gradual re-weight glides on chain time; top up raises venue limits", async ({ page }) => {
  test.setTimeout(240_000);
  await injectWallet(page, ACCOUNTS.launcher);
  await page.goto("/my");
  await connect(page);
  await expect(page.getByTestId("alloc-now-tWETH")).toBeVisible({ timeout: 60_000 });
  expect(await weight(page, "tWETH")).toBeCloseTo(40, 1);

  // schedule 40/30/30 -> 50/25/25 over 1 hour
  await page.getByTestId("alloc-in-tWETH").fill("50");
  await page.getByTestId("alloc-in-tWBTC").fill("25");
  await page.getByTestId("alloc-in-tUSDC").fill("25");
  await page.getByTestId("reweight-dur").selectOption({ label: "Over 1 hour" });
  await page.getByTestId("reweight-go").click();
  await expect(page.getByTestId("glide-left")).toBeVisible({ timeout: 60_000 });

  // half way (chain time): ETH weight is strictly between 40% and 50%
  await rpc("evm_increaseTime", [1800]);
  await rpc("evm_mine");
  await expect.poll(() => weight(page, "tWETH"), { timeout: 30_000 }).toBeGreaterThan(44);
  const mid = await weight(page, "tWETH");
  expect(mid).toBeLessThan(50);
  await shot(page, "14-reweight");

  // past the end: exactly the new target, glide tag gone
  await rpc("evm_increaseTime", [3600]);
  await rpc("evm_mine");
  await expect.poll(() => weight(page, "tWETH"), { timeout: 30_000 }).toBeCloseTo(50, 1);
  await expect(page.getByTestId("glide-left")).toHaveCount(0);

  // top up: raise the Uniswap cap from the launch split to 80% of each coin, without relaunching
  const before = BigInt((await page.getByTestId("my-limit-v4").getAttribute("data-raw"))!);
  await page.getByTestId("split-v4").fill("80");
  await page.getByTestId("topup").click();
  await expect.poll(async () => BigInt((await page.getByTestId("my-limit-v4").getAttribute("data-raw"))!), { timeout: 120_000 }).toBeGreaterThan(before);
  await expect(page.getByTestId("my-busy")).toHaveCount(0, { timeout: 60_000 });
  await shot(page, "15-topup");
});
