import { test, expect, shot } from "../fixtures";

test("privacy: every read listed with route + isolation key, share shown, local-fork banner", async ({ page }) => {
  await page.goto("/book");
  await expect(page.getByTestId("quote-row")).toHaveCount(3);
  // client-side navigation keeps this session's read log
  await page.locator("header").getByRole("link", { name: "Privacy" }).first().click();
  await expect(page).toHaveURL(/privacy/);
  await expect(page.getByTestId("local-banner")).toBeVisible();
  const rows = page.getByTestId("read-row");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(3);
  for (const r of (await rows.all()).slice(0, 25)) {
    expect(await r.getAttribute("data-route")).toBe("local-direct"); // on the fork: no anonymity network reaches localhost
    expect((await r.getAttribute("data-key"))!.length).toBeGreaterThan(0);
  }
  const keys = new Set(await Promise.all((await rows.all()).map((r) => r.getAttribute("data-key"))));
  expect(keys.size).toBeGreaterThan(1); // separate isolation keys per maker / strategy
  await expect(page.getByTestId("anon-share")).toBeVisible();
  await page.getByTestId("probe").click();
  await expect(page.getByTestId("probe-result")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("probe-result")).toContainText("chain 31337");
  await shot(page, "06-privacy");
});
