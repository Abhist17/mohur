import { test, expect, shot } from "../fixtures";

test("docs: quickstart, copyable code, live contract addresses, every section linked", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs");
  const docs = page.getByTestId("docs");
  await expect(docs.getByRole("heading", { level: 1 })).toHaveText("Build with Unison");
  await expect(docs).toContainText("./scripts/demo.sh");
  // copy the quickstart
  await docs.getByRole("button", { name: "Copy code" }).first().click();
  await expect(docs.getByRole("button", { name: "Copy code" }).first()).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("git clone --recursive");
  // the contracts table shows this build's addresses
  await expect(page.getByTestId("docs-contracts")).toContainText("0x");
  // every table-of-contents link has a target section
  for (const href of await page.locator(".doc-toc a[href^='#']").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
    await expect(page.locator(href!)).toBeAttached();
  }
  // site nav, with Launch app
  await expect(page.getByTestId("nav-launch")).toBeVisible();
  await shot(page, "18-docs");
});
