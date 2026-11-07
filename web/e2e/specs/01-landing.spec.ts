import { test, expect, watchErrors, shot } from "../fixtures";

test("landing: the hook sentence, the live price board (both venues equal), the shop story, receipts, no console errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("hero-title")).toHaveText("Stop splitting your coins across exchanges.");
  await expect(page.getByTestId("launch-app")).toHaveAttribute("href", /\/swap/);
  await expect(page.getByTestId("landing-demo")).toHaveAttribute("href", /\/demo/);
  await expect(page.getByTestId("trust-row")).toContainText("59 contract tests");

  // the price board: one wallet, both venues quoting the same trade, identical
  const board = page.getByTestId("live-card");
  await expect(board).toContainText("live · demo index", { timeout: 30_000 });
  const v4 = await page.getByTestId("live-v4").textContent();
  expect(v4).toMatch(/\d/);
  await expect(page.getByTestId("live-aqua")).toHaveText(v4!);
  await expect(page.getByTestId("live-gap")).toHaveText("0 wei");

  // the story, the receipts, the docs
  for (const id of ["idea", "proof", "get", "security", "faq"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.getByTestId("problem-solution")).toContainText("With Tenbin");
  await expect(page.getByTestId("receipt")).toContainText("difference 0 wei");
  await expect(page.getByTestId("docs-cta")).toHaveAttribute("href", /\/docs/);
  await expect(page.getByTestId("nav-launch")).toHaveText("Open the app");

  await shot(page, "01-landing", false);
  await shot(page, "01-landing-full");
  expect(errors).toEqual([]);
});
