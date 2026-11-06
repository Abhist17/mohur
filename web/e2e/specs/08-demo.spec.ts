import { test, expect, injectWallet, connect, ACCOUNTS, shot } from "../fixtures";

test("guided demo: runs all six steps for real, resumes after reload, and is idempotent", async ({ page }) => {
  test.setTimeout(240_000);
  await injectWallet(page, ACCOUNTS.demo);
  await page.goto("/demo");
  await expect(page.getByTestId("demo-banner")).toContainText("Demo mode");
  await connect(page);

  // run the first three steps one by one, then reload: progress must survive
  for (const id of ["faucet", "approve", "quote"]) {
    await page.getByTestId(`demo-step-${id}`).getByRole("button", { name: "Run" }).click();
    await expect(page.getByTestId(`demo-step-${id}`)).toHaveAttribute("data-done", "1", { timeout: 60_000 });
  }
  await expect(page.getByTestId("demo-out-quote")).toContainText("difference 0 wei");
  await page.reload();
  await expect(page.getByTestId("demo-step-quote")).toHaveAttribute("data-done", "1", { timeout: 30_000 });

  // resume runs the rest
  const run = page.getByTestId("demo-run");
  await expect(run).toHaveText("Resume the demo");
  await run.click();
  await expect(page.getByTestId("demo-step-loop")).toHaveAttribute("data-done", "1", { timeout: 180_000 });
  await expect(page.getByTestId("demo-out-v4")).toContainText("100 USDC →");
  await expect(page.getByTestId("demo-out-aqua")).toContainText("100 USDC →");
  await expect(page.getByTestId("demo-out-loop")).toContainText("the loop loses");
  await expect(run).toHaveText("All done");
  await shot(page, "13-demo");

  // start over: faucet/approve are skipped against chain state (no duplicate mint/approve)
  await page.getByRole("button", { name: "Start over" }).click();
  for (const id of ["faucet", "approve"]) {
    await page.getByTestId(`demo-step-${id}`).getByRole("button", { name: "Run" }).click();
    await expect(page.getByTestId(`demo-step-${id}`)).toContainText("already done", { timeout: 60_000 });
  }
});
