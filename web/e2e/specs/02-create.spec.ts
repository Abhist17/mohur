import { test, expect, chain, deployments, shot } from "../fixtures";
import { parseAbi } from "viem";

const lensAbi = parseAbi([
  "function previewSpot(uint256,uint256,uint256,uint256) pure returns (uint256)",
  "function previewOutGivenIn(uint256,uint256,uint256,uint256,uint256,uint256) pure returns (uint256)",
]);
const total = (page: import("@playwright/test").Page) => page.getByTestId("weight-total").innerText().then(Number);

test("create: weights always sum to 100%, preview equals the contracts' math (MohurLens)", async ({ page }) => {
  await page.goto("/create");
  await expect(page.getByTestId("weight-total")).toHaveText("100");
  for (const [sym, v] of [["tWETH", "55"], ["tWBTC", "10"], ["tUSDC", "70"], ["tWETH", "1"], ["tWBTC", "97"]] as const) {
    await page.getByTestId(`weight-${sym}`).fill(v);
    expect(await total(page)).toBe(100);
  }
  // removing a coin and adding it back keeps 100%
  await page.getByRole("checkbox").nth(1).uncheck();
  expect(await total(page)).toBe(100);
  await page.getByRole("checkbox").nth(1).check();
  expect(await total(page)).toBe(100);

  // preview rows come from MohurLens; recompute each on-chain and demand exact equality
  const rows = page.getByTestId("preview-row");
  await expect(rows.first()).toHaveAttribute("data-source", "lens");
  const lens = deployments().lens;
  for (const r of await rows.all()) {
    const args = JSON.parse((await r.getAttribute("data-args"))!).map(BigInt) as bigint[];
    const spot = await chain.readContract({ address: lens, abi: lensAbi, functionName: "previewSpot", args: [args[0], args[1], args[2], args[3]] });
    const out = await chain.readContract({ address: lens, abi: lensAbi, functionName: "previewOutGivenIn", args: [args[0], args[1], args[2], args[3], args[4], 3n * 10n ** 15n] });
    expect(await r.getAttribute("data-spot")).toBe(String(spot));
    expect(await r.getAttribute("data-out")).toBe(String(out));
  }
  // back to the default for the launch test
  await page.getByTestId("weight-tWETH").fill("40");
  await page.getByTestId("weight-tWBTC").fill("30");
  await shot(page, "02-create");
});
