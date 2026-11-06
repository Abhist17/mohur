import { test, expect, injectWallet, connect, ACCOUNTS, shot, deployments } from "../fixtures";

const PAGES = ["/", "/swap", "/explore", "/book", "/my", "/arbitrage", "/privacy", "/how", "/demo", "/create", "/share", "/docs"];

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("mobile: every page fits a 390px phone (no sideways scroll), menu works", async ({ page }) => {
  test.setTimeout(180_000);
  await injectWallet(page, ACCOUNTS.trader);
  const d = deployments();
  await page.goto("/swap");
  await connect(page);
  const wide: string[] = [];
  for (const p of PAGES) {
    await page.goto(p === "/share" ? `/share?index=${d.demoHook}` : p);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (sw > iw + 1) wide.push(`${p}: ${sw}px > ${iw}px`);
    await shot(page, `m${p === "/" ? "-landing" : p.replace("/", "-")}`);
  }
  expect(wide, wide.join("\n")).toEqual([]);
  // burger menu opens and navigates
  await page.goto("/");
  // landing: the site menu (story + docs + Launch app)
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator(".nav-mobile").getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/docs/);
  // inside the app: the screens menu
  await page.goto("/swap");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator(".nav-mobile").getByRole("link", { name: "Book" }).click();
  await expect(page).toHaveURL(/\/book/);
});
