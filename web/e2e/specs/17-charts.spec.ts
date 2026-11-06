import { test, expect, injectWallet, connect, ACCOUNTS, shot } from "../fixtures";
import type { Locator } from "@playwright/test";

/** Read a chart's table view (every chart has one) as rows of cell texts. */
async function table(chart: Locator) {
  await chart.locator("details.chart-table summary").click();
  return chart.locator("details.chart-table tbody tr").evaluateAll((rows) =>
    rows.map((r) => Array.from(r.querySelectorAll("td")).map((td) => td.textContent?.trim() ?? "")),
  );
}

test("charts: same price at every size (both venues identical), any loop size loses, hold vs Unison, read latency", async ({ page }) => {
  test.setTimeout(180_000);
  await injectWallet(page, ACCOUNTS.launcher); // owns an index after 03-launch
  await page.goto("/book");
  await connect(page);

  // Book: the two venue lines are the same line
  const curve = page.getByTestId("size-curve");
  await expect(curve).toBeVisible({ timeout: 60_000 });
  await expect(curve.locator("svg path[stroke]")).toHaveCount(2);
  const rows = await table(curve);
  expect(rows.length).toBeGreaterThan(4);
  for (const [size, uni, inch] of rows) if (uni !== "–" && inch !== "–") expect(inch, size).toBe(uni);
  await curve.scrollIntoViewIfNeeded();
  await curve.screenshot({ path: "e2e/artifacts/19-chart-size.png" });

  // Arbitrage: every size of the loop comes back short
  await page.goto("/arbitrage");
  const loops = page.getByTestId("loop-sizes");
  await expect(loops).toBeVisible({ timeout: 60_000 });
  const lr = await table(loops);
  const pcts = lr.map(([, v]) => v).filter((v) => v !== "–").map((v) => parseFloat(v));
  expect(pcts.length).toBeGreaterThan(3);
  for (const p of pcts) expect(p).toBeLessThan(0);
  await loops.scrollIntoViewIfNeeded();
  await loops.screenshot({ path: "e2e/artifacts/20-chart-loops.png" });

  // My index: hold vs Unison, two labelled lines
  await page.goto("/my");
  const hold = page.getByTestId("hold-chart");
  await expect(hold).toBeVisible({ timeout: 60_000 });
  await expect(hold.locator(".chart-legend")).toContainText("Just holding");
  await expect(hold.locator(".chart-legend")).toContainText("Unison");
  await hold.scrollIntoViewIfNeeded();
  await hold.screenshot({ path: "e2e/artifacts/21-chart-hold.png" });

  // Privacy: one column per read
  await page.goto("/privacy");
  const lat = page.getByTestId("latency-chart");
  await expect(lat).toBeVisible({ timeout: 60_000 });
  expect(await lat.locator("svg path").count()).toBeGreaterThan(0);
  await lat.scrollIntoViewIfNeeded();
  await lat.screenshot({ path: "e2e/artifacts/22-chart-latency.png" });
  await shot(page, "22-privacy-chart");
});
