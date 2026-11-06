import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, type Address } from "viem";

export const RPC = "http://127.0.0.1:8545";
export const ART = join(__dirname, "artifacts");
export const deployments = () =>
  JSON.parse(readFileSync(join(__dirname, "../../contracts/deployments/local.json"), "utf8")) as Record<string, Address> & { startBlock: number };
export const chain = createPublicClient({ transport: http(RPC) });

/** anvil's default dev accounts (unlocked on anvil: it signs eth_sendTransaction itself, no key in the browser) */
export const ACCOUNTS = {
  launcher: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as Address, // #5
  trader: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as Address, // #6
  arber: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as Address, // #7
  demo: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as Address, // #8
};

/** Inject an EIP-1193 wallet (window.ethereum) bound to `address`, backed by the anvil node. */
export async function injectWallet(page: Page, address: Address) {
  await page.addInitScript(
    ({ address, rpc }) => {
      let id = 1;
      const call = async (method: string, params: unknown[] = []) => {
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }) });
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
        return j.result;
      };
      (window as unknown as { ethereum: unknown }).ethereum = {
        isMohurTestWallet: true,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
          if (method === "eth_chainId") return "0x7a69";
          if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
          return call(method, params ?? []);
        },
        on() {},
        removeListener() {},
      };
    },
    { address, rpc: RPC },
  );
}

/** Connect through the app's "Browser wallet" button (the injected path). */
export async function connect(page: Page) {
  const nav = page.locator("header");
  if (await nav.getByRole("button", { name: /0x[0-9a-f]{4}/i }).isVisible().catch(() => false)) return;
  await nav.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("button", { name: "Browser wallet" }).click();
  await expect(nav.getByRole("button", { name: /0x[0-9a-f]{4}/i })).toBeVisible();
}

/** Collect real page errors (ignores browser-extension noise). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/chrome-extension:|Download the React DevTools|favicon/.test(t)) return;
    errors.push(`console: ${t}`);
  });
  return errors;
}

/** Full-page screenshot from the top (a scrolled page would paint the sticky nav mid-capture). */
export async function shot(page: Page, name: string, fullPage = true) {
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  return page.screenshot({ path: join(ART, `${name}.png`), fullPage });
}

export { base as test, expect };
