"use client";

import { getContractAddress, parseAbiItem, type Address, type Hex } from "viem";
import { MohurHookAbi, MohurHookFactoryAbi, MohurLensAbi } from "@/generated/abis";
import { deployment, LOG_CHUNK, SAFE_LOG_CHUNK } from "./config";
import { keys, readClient } from "./anon";

export const ZERO: Address = "0x0000000000000000000000000000000000000000";

// ------------------------------------------------------------------------------------------------
// Token presentation
// ------------------------------------------------------------------------------------------------

export type TokenMeta = { symbol: string; name: string; decimals: number; color: string; metal: string; usdGuess: number };
export const TOKEN_STYLE: Record<string, TokenMeta> = {
  tWETH: { symbol: "tWETH", name: "ETH", decimals: 18, color: "#627eea", metal: "gold", usdGuess: 4000 },
  tWBTC: { symbol: "tWBTC", name: "BTC", decimals: 8, color: "#f7931a", metal: "copper", usdGuess: 100000 },
  tUSDC: { symbol: "tUSDC", name: "USDC", decimals: 6, color: "#2775ca", metal: "silver", usdGuess: 1 },
};

export function fmt(x: number, d = 4) {
  if (!Number.isFinite(x)) return "-";
  if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(x) >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return x.toLocaleString(undefined, { maximumSignificantDigits: d });
}
export const units = (v: bigint, d: number) => Number(v) / 10 ** d;
/** On-chain amount -> short human string (never 18 raw decimals). */
export const amt = (v: bigint, d: number, sig = 6) => fmt(units(v, d), sig);

// ------------------------------------------------------------------------------------------------
// Float weighted-pool math (for simulations and previews only - the chain uses MohurMath)
// ------------------------------------------------------------------------------------------------

export const sim = {
  spot: (bi: number, wi: number, bj: number, wj: number) => (wi / wj) * (bj / bi),
  outGivenIn: (bi: number, wi: number, bo: number, wo: number, a: number, f = 0.003) =>
    bo * (1 - Math.pow(bi / (bi + a * (1 - f)), wi / wo)),
  /** Holdings after an external price move of factor k on token `i`, arbitraged back to target (no fees). */
  rebalanced: (balances: number[], weights: number[], i: number, k: number) =>
    balances.map((b, j) => (j === i ? b * Math.pow(k, weights[i] - 1) : b * Math.pow(k, weights[i]))),
};

// ------------------------------------------------------------------------------------------------
// Reads (all via the anon-rpc transport)
// ------------------------------------------------------------------------------------------------

export type BookToken = {
  token: Address;
  symbol: string;
  decimals: number;
  weight: bigint;
  walletBalance: bigint;
  pending: bigint;
  effectiveBalance: bigint;
  v4Limit: bigint;
  aquaLimit: bigint;
};
export type BookPair = { tokenA: Address; tokenB: Address; aquaStrategyHash: Hex; aquaLimitA: bigint; aquaLimitB: bigint; priceAinB: bigint };
export type Book = { maker: Address; hook: Address; fee: bigint; v4StrategyHash: Hex; tokens: readonly BookToken[]; pairs: readonly BookPair[] };

export async function readBook(hook: Address, maker?: Address): Promise<Book> {
  const d = deployment()!;
  const c = readClient("book (lens)", keys.maker(maker ?? hook));
  return (await c.readContract({ address: d.lens, abi: MohurLensAbi, functionName: "book", args: [hook, d.swapVM] })) as unknown as Book;
}

export async function quoteBoth(hook: Address, tokenIn: Address, tokenOut: Address, amount: bigint, exactIn = true) {
  const d = deployment()!;
  const [a, b] = tokenIn < tokenOut ? [tokenIn, tokenOut] : [tokenOut, tokenIn];
  const c = readClient("quote both venues", keys.strategy(hook, a, b));
  const { result } = await c.simulateContract({
    address: d.lens,
    abi: MohurLensAbi,
    functionName: "quoteBoth",
    args: [hook, d.swapVM, tokenIn, tokenOut, amount, exactIn],
  });
  const [v4In, v4Out, v4Ok, aquaIn, aquaOut, aquaOk] = result as readonly [bigint, bigint, boolean, bigint, bigint, boolean];
  return { v4In, v4Out, v4Ok, aquaIn, aquaOut, aquaOk };
}

export async function quoteRoute(hook: Address, path: Address[], venues: number[], amountIn: bigint, trader?: Address) {
  const d = deployment()!;
  const c = readClient("quote route", keys.trader(trader));
  const [amounts, ok] = (await c.readContract({
    address: d.lens,
    abi: MohurLensAbi,
    functionName: "quoteRoute",
    args: [hook, d.swapVM, path, venues, amountIn],
  })) as readonly [readonly bigint[], boolean];
  return { amounts: [...amounts], withinLimits: ok };
}

export async function hookOf(maker: Address): Promise<Address | undefined> {
  const d = deployment();
  if (!d) return;
  const c = readClient("find my hook", keys.maker(maker));
  const h = (await c.readContract({ address: d.hookFactory, abi: MohurHookFactoryAbi, functionName: "hookOf", args: [maker] })) as Address;
  return h === ZERO ? undefined : h;
}

/** Mine a CREATE2 salt whose hook address carries exactly Unison's v4 permission bits - in the browser. */
export async function mineHookSalt(maker: Address, onProgress?: (n: number) => void) {
  const d = deployment()!;
  const c = readClient("hook init code hash", keys.maker(maker));
  const bytecodeHash = (await c.readContract({ address: d.hookFactory, abi: MohurHookFactoryAbi, functionName: "initCodeHash", args: [maker] })) as Hex;
  const FLAGS = (1n << 13n) | (1n << 11n) | (1n << 7n) | (1n << 3n);
  const MASK = (1n << 14n) - 1n;
  for (let i = 0; i < 2_000_000; i++) {
    const salt = `0x${i.toString(16).padStart(64, "0")}` as Hex;
    const addr = getContractAddress({ from: d.hookFactory, salt, bytecodeHash, opcode: "CREATE2" });
    if ((BigInt(addr) & MASK) === FLAGS) return { salt, address: addr, tries: i + 1 };
    if (i % 2000 === 0) {
      onProgress?.(i);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  throw new Error("no salt found");
}

// ------------------------------------------------------------------------------------------------
// Fill feed: Uniswap fills (hook Fill events) + 1inch fills (SwapVM Swapped events for this maker)
// ------------------------------------------------------------------------------------------------

export type FillRow = { venue: "Uniswap v4" | "1inch Aqua"; block: bigint; tx: Hex; tokenIn: Address; tokenOut: Address; amountIn: bigint; amountOut: bigint; trader: Address };

export const fillEvt = parseAbiItem("event Fill(address indexed trader, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee)");
export const swappedEvt = parseAbiItem("event Swapped(bytes32 orderHash, address maker, address taker, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)");

const fillCache = new Map<string, { scanned: bigint; rows: FillRow[] }>();
let narrowLogs = false;

export async function readFills(hook: Address, maker: Address): Promise<FillRow[]> {
  const d = deployment()!;
  const c = readClient("fill history", keys.maker(maker));
  const id = hook.toLowerCase();
  const cached = fillCache.get(id) ?? { scanned: BigInt(d.startBlock) - 1n, rows: [] };
  const head = await c.getBlockNumber();
  // never scan more than ~40 chunks per refresh on public RPCs
  let from = cached.scanned + 1n;
  const chunk = narrowLogs ? SAFE_LOG_CHUNK : LOG_CHUNK;
  if (head - from > chunk * 40n) from = head - chunk * 40n; // at most 40 requests per refresh
  const rows = [...cached.rows];
  const ranges: [bigint, bigint][] = [];
  for (let start = from; start <= head; start += chunk) ranges.push([start, start + chunk - 1n > head ? head : start + chunk - 1n]);
  // fetch ranges in parallel batches: over a mixnet each request costs seconds
  type Logs = Awaited<ReturnType<typeof c.getLogs<typeof fillEvt>>>;
  type SwLogs = Awaited<ReturnType<typeof c.getLogs<typeof swappedEvt>>>;
  for (let k = 0; k < ranges.length; k += 5) {
    let batch: [Logs, SwLogs][];
    try {
      batch = await Promise.all(
        ranges.slice(k, k + 5).map(([fromBlock, toBlock]) =>
          Promise.all([
            c.getLogs({ address: hook, event: fillEvt, fromBlock, toBlock }),
            c.getLogs({ address: d.swapVM, event: swappedEvt, fromBlock, toBlock }),
          ]),
        ),
      );
    } catch (e) {
      if (!narrowLogs && /limit|range|too many|exceed/i.test(String((e as Error).message))) {
        narrowLogs = true; // this RPC caps the range: rescan in small chunks
        return readFills(hook, maker);
      }
      throw e;
    }
    for (const [v4, aq] of batch) {
      for (const l of v4)
        rows.push({ venue: "Uniswap v4", block: l.blockNumber!, tx: l.transactionHash!, tokenIn: l.args.tokenIn!, tokenOut: l.args.tokenOut!, amountIn: l.args.amountIn!, amountOut: l.args.amountOut!, trader: l.args.trader! });
      for (const l of aq)
        if (l.args.maker?.toLowerCase() === maker.toLowerCase())
          rows.push({ venue: "1inch Aqua", block: l.blockNumber!, tx: l.transactionHash!, tokenIn: l.args.tokenIn!, tokenOut: l.args.tokenOut!, amountIn: l.args.amountIn!, amountOut: l.args.amountOut!, trader: l.args.taker! });
    }
  }
  rows.sort((a, b) => Number(b.block - a.block));
  fillCache.set(id, { scanned: head, rows });
  return rows;
}

// ------------------------------------------------------------------------------------------------
// Explore: every index launched through the factory
// ------------------------------------------------------------------------------------------------

const deployedEvt = parseAbiItem("event HookDeployed(address indexed maker, address hook, bytes32 salt)");
export type IndexCard = { hook: Address; maker: Address; block: bigint; book?: Book };

export async function readIndexes(): Promise<IndexCard[]> {
  const d = deployment()!;
  const c = readClient("explore indexes", keys.public);
  const head = await c.getBlockNumber();
  const from = BigInt(d.startBlock);
  const ranges: [bigint, bigint][] = [];
  const chunk = narrowLogs ? SAFE_LOG_CHUNK : LOG_CHUNK;
  for (let s = from; s <= head; s += chunk) ranges.push([s, s + chunk - 1n > head ? head : s + chunk - 1n]);
  const cards: IndexCard[] = [];
  for (let k = 0; k < ranges.length; k += 5) {
    let batch;
    try {
      batch = await Promise.all(
        ranges.slice(k, k + 5).map(([fromBlock, toBlock]) => c.getLogs({ address: d.hookFactory, event: deployedEvt, fromBlock, toBlock })),
      );
    } catch (e) {
      if (!narrowLogs && /limit|range|too many|exceed/i.test(String((e as Error).message))) {
        narrowLogs = true;
        return readIndexes();
      }
      throw e;
    }
    for (const logs of batch) for (const l of logs) cards.push({ hook: l.args.hook!, maker: l.args.maker!, block: l.blockNumber! });
  }
  // newest first; read each book in parallel (an index that hasn't set weights yet has no book)
  cards.sort((a, b) => Number(b.block - a.block));
  await Promise.all(cards.map(async (x) => { try { x.book = await readBook(x.hook, x.maker); } catch {} }));
  return cards;
}

export { MohurHookAbi };
