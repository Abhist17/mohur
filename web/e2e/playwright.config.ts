import { defineConfig } from "@playwright/test";

/**
 * Two suites:
 *  - default (`npm run e2e`): fresh anvil fork of Base Sepolia + deploy + the app on :3100, every screen.
 *  - @testnet (`npm run e2e:testnet`): the deployed Base Sepolia build (GitHub Pages by default), checks reads
 *    really travel through Anon-RPC and, if E2E_PROXY_URL is set, that the logging proxy saw anonymity-network exits.
 * Uses the system Google Chrome (no browser download).
 */
const testnet = !!process.env.E2E_TESTNET;
const PORT = 3100;

export default defineConfig({
  testDir: "./specs",
  outputDir: "./artifacts/test-results",
  timeout: testnet ? 240_000 : 180_000,
  expect: { timeout: testnet ? 120_000 : 45_000 },
  fullyParallel: false,
  workers: 1, // one chain; flows build on each other
  reporter: [["list"], ["html", { outputFolder: "./artifacts/report", open: "never" }]],
  grep: testnet ? /@testnet/ : undefined,
  grepInvert: testnet ? undefined : /@testnet/,
  globalSetup: testnet ? undefined : "./global-setup.ts",
  use: {
    channel: "chrome",
    headless: !process.env.HEADED,
    viewport: { width: 1366, height: 900 },
    baseURL: testnet ? process.env.E2E_BASE_URL || "https://abhist17.github.io/unison/" : `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: testnet
    ? undefined
    : {
        // its own build dir, so it never clobbers a dev server you already run on :3000
        command: `NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_UNISON_NETWORK=local npx next dev -p ${PORT}`,
        cwd: "..",
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
