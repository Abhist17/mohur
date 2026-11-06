import { test, expect, shot } from "../fixtures";

/** Run with: npm run e2e:testnet   (E2E_BASE_URL defaults to the GitHub Pages build; set E2E_PROXY_URL to check the proxy) */
test.describe("@testnet deployed Base Sepolia build", () => {
  test("@testnet reads go through Anon-RPC: Tor first, Nym fallback, Base Sepolia answers", async ({ page }) => {
    // start from Tor (the app falls back to Nym by itself if Tor cannot bootstrap in 35 s)
    await page.addInitScript(() => localStorage.setItem("mohur.worker", "tor-js"));
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
        expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth), p).toBeGreaterThan(0);
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

  test("@testnet logging proxy saw requests from anonymity-network exits", async ({ request }) => {
    const proxy = process.env.E2E_PROXY_URL;
    test.skip(!proxy, "set E2E_PROXY_URL to a public proxy/server.mjs (the build must use it as NEXT_PUBLIC_MOHUR_PROXY_URL)");
    const log = await (await request.get(new URL("/log", proxy).toString())).json();
    expect(log.entries.length).toBeGreaterThan(0);
    expect(log.entries.some((e: { tor: boolean }) => e.tor)).toBe(true);
  });
});
