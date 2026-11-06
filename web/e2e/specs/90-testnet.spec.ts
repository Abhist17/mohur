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

  test("@testnet logging proxy saw requests from anonymity-network exits", async ({ request }) => {
    const proxy = process.env.E2E_PROXY_URL;
    test.skip(!proxy, "set E2E_PROXY_URL to a public proxy/server.mjs (the build must use it as NEXT_PUBLIC_MOHUR_PROXY_URL)");
    const log = await (await request.get(new URL("/log", proxy).toString())).json();
    expect(log.entries.length).toBeGreaterThan(0);
    expect(log.entries.some((e: { tor: boolean }) => e.tor)).toBe(true);
  });
});
