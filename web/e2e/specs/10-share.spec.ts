import { test, expect, chain, deployments, ACCOUNTS, shot } from "../fixtures";
import { parseAbi, type Address } from "viem";

test("share card: on-chain weights, price and fills; links keep the picked index", async ({ page }) => {
  const d = deployments();
  await page.goto(`/share?index=${d.demoHook}`);
  const card = page.getByTestId("share-card");
  await expect(card.getByTestId("share-w-tWETH")).toContainText("40%", { timeout: 60_000 });
  await expect(card.getByTestId("share-w-tWBTC")).toContainText("30%");
  await expect(card.getByTestId("share-price").first()).toBeVisible();
  // the demo index has real fills from the demo script and earlier specs
  await expect.poll(async () => Number(await card.getByTestId("share-fills").textContent()), { timeout: 60_000 }).toBeGreaterThan(0);
  await shot(page, "16-share");
  await card.getByTestId("share-trade").click();
  await expect(page).toHaveURL(new RegExp(`/swap\\?index=${d.demoHook}`, "i"));

  // a picked (non-demo) index: Book's Trade button must keep it
  const launcherHook = (await chain.readContract({
    address: d.hookFactory,
    abi: parseAbi(["function hookOf(address) view returns (address)"]),
    functionName: "hookOf",
    args: [ACCOUNTS.launcher],
  })) as Address;
  await page.goto(`/book?index=${launcherHook}`);
  await expect(page.getByText("· picked index")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("book-trade")).toHaveAttribute("href", new RegExp(`index=${launcherHook}`, "i"));
});
