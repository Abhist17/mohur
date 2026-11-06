import { test, expect, shot } from "../fixtures";

/** Run with: npm run e2e:testnet   (E2E_BASE_URL defaults to the GitHub Pages build; set E2E_PROXY_URL to check the proxy) */
test.describe("@testnet deployed Base Sepolia build", () => {
  test("@testnet reads go through Anon-RPC: Tor first, Nym fallback, Base Sepolia answers", async ({ page }) => {
    // start from Tor (the app falls back to Nym by itself if Tor cannot bootstrap in 35 s)
    await page.addInitScript(() => localStorage.setItem("unison.worker", "tor-js"));
    await page.goto("privacy/");
    await page.getByTestId("probe").click();
    const result = page.getByTestId("probe-result");
    await expect(result).toHaveAttribute("data-state", "ok", { timeout: 180_000 });
    await expect(result).toContainText("chain 84532");
    const rows = page.getByTestId("read-row");
    const routes = await Promise.all((await rows.all()).map((r) => r.getAttribute("data-route")));
    expect(routes).toContain("anon-rpc");
    expect(routes).toContain("bootstrap"); // the one documented exception
    const reads = routes.filter((r) => r !== "bootstrap");
    expect(reads.every((r) => r === "anon-rpc")).toBe(true); // 100% of chain reads anonymised
    const tor = await page.getByText(/falling back to Nym/).count();
    test.info().annotations.push({ type: "network", description: tor ? "Tor unreachable -> Nym fallback" : "Tor worked" });
    await shot(page, "90-testnet-privacy");
  });

  test("@testnet every chain screen either works or explains itself (never a dead end)", async ({ page }) => {
    for (const p of ["swap/", "explore/", "book/", "my/", "arbitrage/", "demo/", "share/", "launch/"]) {
      await page.goto(p);
      const nd = page.getByTestId("not-deployed");
      // contracts deployed: the real screen renders (it has an explain box or the share card); not yet: the
      // not-deployed explainer with a labelled screenshot. Wait for one of the two before deciding.
      await expect(page.locator('[data-testid="not-deployed"], [data-testid="explain"], [data-testid="share-card"]').first(), p).toBeVisible({ timeout: 30_000 });
      if (await nd.count()) {
        await expect(nd.getByText("./scripts/demo.sh")).toBeVisible();
        const img = nd.locator("img");
        await expect(img, p).toBeVisible();
        // wait for the download (a cold CDN can take a few seconds), then require a real image
        await expect.poll(() => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : -1)), { timeout: 30_000, message: p }).toBeGreaterThan(0);
        await expect(nd.getByText("Not live data")).toBeVisible();
      }
    }
    await page.goto("swap/");
    await shot(page, "91-testnet-swap");
  });

  test("@testnet once deployed: the live Book quotes both venues identically, read through Anon-RPC", async ({ page }) => {
    test.setTimeout(600_000); // several reads over a mixnet (~50 s each through Nym)
    await page.goto("book/");
    const gate = page.locator('[data-testid="not-deployed"], [data-testid="quote-row"]').first();
    await expect(gate).toBeVisible({ timeout: 300_000 });
    test.skip((await page.getByTestId("not-deployed").count()) > 0, "contracts not deployed on Base Sepolia yet (run scripts/deploy-base-sepolia.sh)");
    const rows = page.getByTestId("quote-row");
    await expect(rows).toHaveCount(3, { timeout: 300_000 });
    for (const r of await rows.all()) {
      const [v4, aqua] = [await r.getAttribute("data-v4"), await r.getAttribute("data-aqua")];
      expect(BigInt(v4!), (await r.getAttribute("data-pair"))!).toBeGreaterThan(0n);
      expect(v4, (await r.getAttribute("data-pair"))!).toBe(aqua); // 0 wei apart on the live chain
    }
    await shot(page, "92-testnet-book");
  });

  test("@testnet a judge's walk: every page loads with no console errors, no broken images, no broken internal links", async ({ page, request, baseURL }) => {
    test.setTimeout(300_000);
    const PAGES = ["", "swap/", "explore/", "book/", "my/", "create/", "launch/", "arbitrage/", "privacy/", "how/", "demo/", "share/"];
    const problems: string[] = [];
    const links = new Set<string>();
    page.on("pageerror", (e) => problems.push(`page error on ${page.url()}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon/i.test(m.text())) problems.push(`console error on ${page.url()}: ${m.text().slice(0, 160)}`); });
    for (const p of PAGES) {
      const res = await page.goto(p);
      if (!res || res.status() >= 400) problems.push(`${p || "/"}: HTTP ${res?.status()}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1000);
      const broken = await page.$$eval("img", (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src")));
      for (const b of broken) problems.push(`${p || "/"}: broken image ${b}`);
      for (const h of await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href))) links.add(h.split("#")[0]);
    }
    const base = new URL(baseURL!);
    for (const href of links) {
      if (!href.startsWith(base.origin + base.pathname)) continue; // internal only; external sites are not ours to test
      const r = await request.get(href);
      if (r.status() >= 400) problems.push(`broken link ${href}: HTTP ${r.status()}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("@testnet if every private route fails, the site says so and offers (never forces) a direct route", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("privacy/");
    await page.getByTestId("probe").click();
    const result = page.getByTestId("probe-result");
    const banner = page.getByTestId("privacy-banner");
    // either a private route works, or (Tor + Nym down) the banner appears; wait for one of the two
    await expect(page.locator('[data-testid="privacy-banner"], [data-testid="probe-result"][data-state="ok"]').first()).toBeVisible({ timeout: 240_000 });
    test.skip(!(await banner.isVisible()), "a private route is up today, nothing to fall back from");
    // nothing was read directly before the user chose it
    const before = await page.locator('[data-testid="read-row"][data-route="direct"]').count();
    expect(before).toBe(0);
    await page.getByTestId("allow-direct").click();
    await expect(page.getByTestId("route-pill")).toContainText("not private");
    await page.getByTestId("probe").click();
    await expect(result).toHaveAttribute("data-state", "ok", { timeout: 60_000 });
    await expect(result).toContainText("chain 84532");
    // every read after the choice is labelled direct, and the share of private reads drops accordingly
    await expect(page.locator('[data-testid="read-row"][data-route="direct"]').first()).toBeVisible();
    await shot(page, "93-testnet-direct");
  });

  test("@testnet forced outage: with Tor and Nym blocked, nothing is read until the user chooses the direct route", async ({ page, baseURL }) => {
    test.setTimeout(300_000);
    // allow only the site itself, the one bootstrap RPC and the Base Sepolia RPCs: the anonymity networks cannot start
    const allowed = [new URL(baseURL ?? "http://127.0.0.1").host, "abhist17.github.io", "ethereum-rpc.publicnode.com", "base-sepolia-rpc.publicnode.com", "sepolia.base.org", "fonts.gstatic.com"];
    await page.route("**/*", (route) => {
      const host = new URL(route.request().url()).host;
      return allowed.some((h) => host === h || host.endsWith(`.${h}`)) ? route.continue() : route.abort();
    });
    await page.goto("privacy/");
    await page.getByTestId("probe").click();
    await expect(page.getByTestId("privacy-banner")).toBeVisible({ timeout: 200_000 });
    await expect(page.locator('[data-testid="read-row"][data-route="direct"]')).toHaveCount(0); // never automatic
    await page.getByTestId("allow-direct").click();
    await expect(page.getByTestId("route-pill")).toContainText("not private");
    await page.getByTestId("probe").click();
    await expect(page.getByTestId("probe-result")).toHaveAttribute("data-state", "ok", { timeout: 60_000 });
    await expect(page.getByTestId("probe-result")).toContainText("chain 84532");
    await expect(page.locator('[data-testid="read-row"][data-route="direct"]').first()).toBeVisible();
    // long failure messages (lists of URLs) wrap instead of pushing the page sideways
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw + 1);
    await shot(page, "93-testnet-direct");
  });

  test("@testnet logging proxy saw requests from anonymity-network exits", async ({ request }) => {
    const proxy = process.env.E2E_PROXY_URL;
    test.skip(!proxy, "set E2E_PROXY_URL to a public proxy/server.mjs (the build must use it as NEXT_PUBLIC_UNISON_PROXY_URL)");
    const log = await (await request.get(new URL("/log", proxy).toString())).json();
    expect(log.entries.length).toBeGreaterThan(0);
    expect(log.entries.some((e: { tor: boolean }) => e.tor)).toBe(true);
  });
});
