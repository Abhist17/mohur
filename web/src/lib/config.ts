import { defineChain, type Chain } from "viem";
import { baseSepolia } from "viem/chains";
import { deployments, type Deployment } from "@/generated/deployments";

export type NetworkId = "local" | "base-sepolia";

export const NETWORK: NetworkId =
  (process.env.NEXT_PUBLIC_UNISON_NETWORK as NetworkId) === "base-sepolia" ? "base-sepolia" : "local";

export const localFork = defineChain({
  id: 31337,
  name: "Local fork of Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const CHAIN: Chain = NETWORK === "base-sepolia" ? baseSepolia : localFork;

/** RPC endpoints the anonymised fetch talks to (primary first, then fallbacks). */
export const RPC_URLS: string[] =
  NETWORK === "base-sepolia"
    ? [
        ...(process.env.NEXT_PUBLIC_UNISON_PROXY_URL ? [process.env.NEXT_PUBLIC_UNISON_PROXY_URL] : []),
        "https://base-sepolia-rpc.publicnode.com", // allows wide eth_getLogs ranges
        "https://sepolia.base.org", // caps eth_getLogs at 200 blocks
      ]
    : [process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:8545"];

/** Block range per eth_getLogs call. Wide where the RPC allows it (each request through a mixnet costs seconds);
 *  readFills drops to SAFE_LOG_CHUNK automatically if an RPC refuses the range (sepolia.base.org caps at 200). */
export const LOG_CHUNK = 10_000n;
export const SAFE_LOG_CHUNK = 200n;

/** Default anonymising network; Tor falls back to Nym automatically if it can't bootstrap. */
export const DEFAULT_WORKER = (process.env.NEXT_PUBLIC_UNISON_WORKER as "tor-js" | "nym" | "passthrough" | undefined) ?? "tor-js";

/** Mainnet RPC used ONCE to read the worker's specifier contract (documented exclusion). */
export const BOOTSTRAP_RPC = "https://ethereum-rpc.publicnode.com";

export type WorkerId = "tor-js" | "nym" | "passthrough";

/** anon-rpc workers, from github.com/ethereum/anon-rpc/blob/main/adopters.json5 (specifiers on mainnet). */
export const WORKERS: Record<WorkerId, { label: string; specifier: `0x${string}`; config?: unknown; anonymizes: boolean; note: string }> = {
  "tor-js": {
    label: "Tor (tor-js)",
    specifier: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    config: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] },
    anonymizes: true,
    note: "A full Tor client in WebAssembly, building circuits in the browser via a KPS gateway. Different isolation keys get different circuits.",
  },
  nym: {
    label: "Nym mixnet",
    specifier: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0",
    anonymizes: true,
    note: "Sphinx packets through the Nym mixnet, exiting at an IP Packet Router. ~18 MB bundle, slower bootstrap.",
  },
  passthrough: {
    label: "Passthrough (reference)",
    specifier: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",
    anonymizes: false,
    note: "Reference worker: plain fetch inside the sandbox. Exercises hash pinning, does NOT anonymise.",
  },
};

export function deployment(): Deployment | undefined {
  return deployments[NETWORK];
}

export const EXPLORER = NETWORK === "base-sepolia" ? "https://sepolia.basescan.org" : "";
