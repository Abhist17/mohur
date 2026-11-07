import { test, expect, injectWallet, connect, chain, deployments, ACCOUNTS, shot } from "../fixtures";
import type { Page } from "@playwright/test";
import { parseAbi, type Address } from "viem";

const quotes = async (page: Page) => {
  const rows = page.getByTestId("quote-row");
  await expect(rows).toHaveCount(3);
  const out: Record<string, { v4: string; aqua: string; ok: string }> = {};
  for (const r of await rows.all())
    out[(await r.getAttribute("data-pair"))!] = { v4: (await r.getAttribute("data-v4"))!, aqua: (await r.getAttribute("data-aqua"))!, ok: (await r.getAttribute("data-ok"))! };
  return out;
};

/** Swap through the Swap screen; clicks through faucet / approve / swap as the button asks. */
async function swap(page: Page, amount: string, venue: 0 | 1) {
  await page.goto("/swap");
  await page.getByTestId("swap-amount").fill(amount);
  await page.getByTestId(`venue-${venue}`).click();
  const cta = page.getByTestId("swap-cta");
  for (let i = 0; i < 4; i++) {
    await expect(cta).toBeEnabled();
    const label = await cta.innerText();
    await cta.click();
    if (/^Swap on/.test(label)) {
      await expect(page.locator(".toast.success").filter({ hasText: /Swap/ }).last()).toBeVisible({ timeout: 60_000 });
      return;
    }
    await expect(cta).not.toHaveText(label, { timeout: 60_000 });
  }
  throw new Error("swap did not complete");
}

test("live book: identical quotes per pair, a fill on one venue moves the other, flush, venue limits", async ({ page }) => {
  await injectWallet(page, ACCOUNTS.trader);
  await page.goto("/book");
  await connect(page);

  const q0 = await quotes(page);
  // the ETH/USDC row, whichever token address sorts first on this fork
  const ETHUSDC = Object.keys(q0).find((k) => k.includes("tWETH") && k.includes("tUSDC"))!;
  expect(ETHUSDC).toBeTruthy();
  for (const [pair, q] of Object.entries(q0)) {
    expect(q.ok, pair).toBe("true");
    expect(q.v4, pair).toBe(q.aqua);
  }

  // a Uniswap fill moves the 1inch quote
  await swap(page, "500", 0);
  await page.goto("/book");
  await expect.poll(async () => (await quotes(page))[ETHUSDC]?.aqua).not.toBe(q0[ETHUSDC].aqua);
  const q1 = await quotes(page);
  for (const [pair, q] of Object.entries(q1)) expect(q.v4, pair).toBe(q.aqua);

  // the Uniswap input waits as claims: flush moves it into the wallet
  const usdcRow = page.locator(`[data-testid=limit-row][data-token="${deployments().tUSDC}" i]`);
  await expect(usdcRow).not.toHaveAttribute("data-pending", "0");
  await page.getByTestId("flush").click();
  await expect(page.locator(".toast.success").filter({ hasText: /flush/i }).last()).toBeVisible({ timeout: 60_000 });
  await expect(usdcRow).toHaveAttribute("data-pending", "0", { timeout: 30_000 });

  // a 1inch fill moves the Uniswap quote
  await swap(page, "500", 1);
  await page.goto("/book");
  await expect.poll(async () => (await quotes(page))[ETHUSDC]?.v4).not.toBe(q1[ETHUSDC].v4);
  for (const [pair, q] of Object.entries(await quotes(page))) expect(q.v4, pair).toBe(q.aqua);

  // venue limits on screen equal what TenbinLens reports on-chain
  const d = deployments();
  const hookAbi = parseAbi(["function venueLimit(address) view returns (uint256)"]);
  for (const r of await page.getByTestId("limit-row").all()) {
    const token = (await r.getAttribute("data-token")) as Address;
    const v4 = await chain.readContract({ address: d.demoHook, abi: hookAbi, functionName: "venueLimit", args: [token] });
    expect(await r.getAttribute("data-v4")).toBe(String(v4));
    expect(BigInt((await r.getAttribute("data-aqua"))!)).toBeGreaterThan(0n);
  }
  await shot(page, "04-book");
});
