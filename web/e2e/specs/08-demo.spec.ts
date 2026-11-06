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
  // received (from the trade's own event) equals the quote, on both venues
  for (const v of ["v4", "aqua"]) {
    const m = (await page.getByTestId(`demo-out-${v}`).textContent())!.match(/→ ([\d.,]+) ETH \(quoted ([\d.,]+)\)/);
    expect(m, v).not.toBeNull();
    expect(m![1], v).toBe(m![2]);
  }
  await expect(page.getByTestId("demo-out-loop")).toContainText("the loop loses");
  await expect(run).toHaveText("All done");
  // the three proofs, big, at the top
  await expect(page.getByTestId("demo-progress")).toHaveText("6 of 6 steps");
  await expect(page.getByTestId("demo-proof-gap")).toContainText("0 wei");
  await expect(page.getByTestId("demo-proof-exact")).toContainText("Exact");
  await expect(page.getByTestId("demo-proof-loop")).toContainText("−0.");
  for (const id of ["gap", "exact", "loop"]) await expect(page.getByTestId(`demo-proof-${id}`)).toHaveClass(/ok/);
  await shot(page, "13-demo");

  // start over: faucet/approve are skipped against chain state (no duplicate mint/approve)
  await page.getByRole("button", { name: "Start over" }).click();
  for (const id of ["faucet", "approve"]) {
    await page.getByTestId(`demo-step-${id}`).getByRole("button", { name: "Run" }).click();
    await expect(page.getByTestId(`demo-step-${id}`)).toContainText("already done", { timeout: 60_000 });
  }
});

test("guided demo stops at the first failed step (no cascade of wallet prompts)", async ({ page }) => {
  await injectWallet(page, "0x756e69736f6e456d70747947617357616c657431"); // no ETH and not unlocked: every transaction fails
  await page.goto("/demo");
  await connect(page);
  await page.getByTestId("demo-run").click();
  await expect(page.locator(".err")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("demo-run")).toBeEnabled();
  await expect(page.getByTestId("demo-step-faucet")).toHaveAttribute("data-done", "0");
  await expect(page.getByTestId("demo-step-approve")).toHaveAttribute("data-done", "0");
  await expect(page.getByText("Approve router", { exact: true })).toHaveCount(0); // step 2 was never attempted
});
