import { test, expect, watchErrors, shot } from "../fixtures";

test("landing: one sentence, the live same-trade card (both venues equal), the story sections, no console errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("hero-title")).toHaveText("One wallet, traded on every venue at one price.");
  await expect(page.getByTestId("launch-app")).toHaveAttribute("href", /\/swap/);
  await expect(page.getByTestId("landing-demo")).toBeVisible();
  await expect(page.getByTestId("trust-row")).toContainText("59 contract tests");

  // the product, live: the same trade quoted on both venues, identical
  const card = page.getByTestId("live-card");
  await expect(card).toContainText("Live · demo index", { timeout: 30_000 });
  const v4 = await page.getByTestId("live-v4").textContent();
  expect(v4).toMatch(/\d/);
  await expect(page.getByTestId("live-aqua")).toHaveText(v4!);
  await expect(page.getByTestId("live-gap")).toHaveText("0 wei");
  await expect(page.getByTestId("chip-loop")).toContainText("−0.");

  // site nav (story) vs app nav, and every section a judge looks for
  await expect(page.getByTestId("nav-launch")).toBeVisible();
  for (const id of ["how", "proof", "security", "faq", "problem"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.getByTestId("problem-solution")).toContainText("With Unison");
  await expect(page.getByTestId("docs-cta")).toHaveAttribute("href", /\/docs/);

  await shot(page, "01-landing", false);
  await shot(page, "01-landing-full");
  expect(errors).toEqual([]);
});
