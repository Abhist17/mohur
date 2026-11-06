import { test, expect, injectWallet, connect, chain, deployments, ACCOUNTS, shot } from "../fixtures";
import { parseAbi } from "viem";

const step = (page: import("@playwright/test").Page, i: number) => page.getByTestId(`launch-step-${i}`);
async function runStep(page: import("@playwright/test").Page, i: number) {
  await expect(page.getByTestId(`launch-run-${i}`)).toBeEnabled();
  await page.getByTestId(`launch-run-${i}`).click();
  await expect(step(page, i)).toHaveAttribute("data-state", "done", { timeout: 120_000 });
}

test("launch: six real transactions from a fresh wallet, resumes after a reload mid-launch", async ({ page }) => {
  await injectWallet(page, ACCOUNTS.launcher);
  await page.goto("/launch");
  await connect(page);
  for (const i of [0, 1, 2]) await runStep(page, i);

  // reload mid-launch: the wallet reconnects silently and the flow resumes from chain state
  await page.reload();
  for (const i of [0, 1, 2]) await expect(step(page, i)).toHaveAttribute("data-state", "done");
  await expect(step(page, 3)).toHaveAttribute("data-state", "todo");

  for (const i of [3, 4, 5]) await runStep(page, i);
  await expect(page.getByTestId("launch-done")).toBeVisible();
  await shot(page, "03-launch");

  const hook = await chain.readContract({
    address: deployments().hookFactory,
    abi: parseAbi(["function hookOf(address) view returns (address)"]),
    functionName: "hookOf",
    args: [ACCOUNTS.launcher],
  });
  expect(hook).not.toBe("0x0000000000000000000000000000000000000000");
});
