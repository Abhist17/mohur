// Headless end-to-end check of every user flow, making the same contract calls (in the same order) as the app's
// screens: Launch, Swap (both venues), Arbitrage me, My index (gradual re-weight, pause, resume), friendly errors.
// Run against the local fork after the deploy scripts:  node scripts/e2e-flows.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseError, ContractFunctionRevertedError, decodeErrorResult, createPublicClient, createWalletClient, encodeAbiParameters, getContractAddress,
  http, keccak256, maxUint256, parseAbi, parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as A from "../src/generated/abis.ts";

const here = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(here, "../../contracts/deployments/local.json"), "utf8"));
const RPC = process.env.RPC || "http://127.0.0.1:8545";
const chain = { id: 31337, name: "fork", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
// anvil dev accounts #3 (fresh maker) and #4 (trader): never used by the deploy scripts
const makerAcct = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
const traderAcct = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
const wal = (a) => createWalletClient({ account: a, chain, transport: http(RPC) });
const M = wal(makerAcct), T = wal(traderAcct);
const ALL_ERRORS = [
  ...Object.values(A).flat(),
  ...parseAbi(["error WrappedError(address target, bytes4 selector, bytes reason, bytes details)"]),
].filter((x) => x.type === "error");
// same unwrapping as the app's src/lib/errors.ts
function innerErrorName(name, args) {
  for (let d = 0; name === "WrappedError" && args && d < 4; d++) {
    try { const r = decodeErrorResult({ abi: ALL_ERRORS, data: args[2] }); name = r.errorName; args = r.args; } catch { break; }
  }
  return name;
}
const pm = parseAbi([
  "function initialize((address,address,uint24,int24,address) key, uint160 sqrtPriceX96) returns (int24)",
  "function extsload(bytes32 slot) view returns (bytes32)",
]);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  PASS ", msg); } else { fail++; console.log("  FAIL ", msg); } };
const section = (s) => console.log(`\n${s}`);
async function tx(w, args) {
  await pub.simulateContract({ ...args, abi: [...args.abi, ...ALL_ERRORS], account: w.account });
  const hash = await w.writeContract({ ...args, account: w.account, chain });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${args.functionName} reverted`);
  return r;
}
async function reverts(w, args) {
  try { await pub.simulateContract({ ...args, abi: [...args.abi, ...ALL_ERRORS], account: w.account }); return null; }
  catch (e) {
    const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    return innerErrorName(rev?.data?.errorName, rev?.data?.args) ?? "reverted";
  }
}
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
const sort = (a, b) => (a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]);

const toks = [D.tWETH, D.tWBTC, D.tUSDC];
const pairs = [[0, 1], [0, 2], [1, 2]].map(([i, j]) => sort(toks[i], toks[j]));

// ------------------------------------------------------------------------------------------------
section("Launch (fresh maker, the six steps of the Launch screen)");
const initHash = await read(D.hookFactory, A.MohurHookFactoryAbi, "initCodeHash", [makerAcct.address]);
const FLAGS = (1n << 13n) | (1n << 11n) | (1n << 7n) | (1n << 3n), MASK = (1n << 14n) - 1n;
let salt, predicted;
for (let i = 0; ; i++) {
  salt = `0x${i.toString(16).padStart(64, "0")}`;
  predicted = getContractAddress({ from: D.hookFactory, salt, bytecodeHash: initHash, opcode: "CREATE2" });
  if ((BigInt(predicted) & MASK) === FLAGS) break;
}
await tx(M, { address: D.hookFactory, abi: A.MohurHookFactoryAbi, functionName: "deploy", args: [salt] });
const hook = await read(D.hookFactory, A.MohurHookFactoryAbi, "hookOf", [makerAcct.address]);
ok(hook.toLowerCase() === predicted.toLowerCase(), `1 hook deployed at the browser-mined address ${hook}`);
for (const t of toks) await tx(M, { address: t, abi: A.MohurTestTokenAbi, functionName: "faucet" });
ok((await read(D.tUSDC, A.MohurTestTokenAbi, "balanceOf", [makerAcct.address])) > 0n, "2 test tokens received");
for (const t of toks) await tx(M, { address: t, abi: A.MohurTestTokenAbi, functionName: "approve", args: [D.aqua, maxUint256] });
ok(true, "3 Aqua approved (only Aqua)");
await tx(M, { address: hook, abi: A.MohurHookAbi, functionName: "setIndex", args: [toks, [4n * 10n ** 17n, 3n * 10n ** 17n, 3n * 10n ** 17n], 3n * 10n ** 15n] });
ok((await read(hook, A.MohurHookAbi, "weights")).join() === [4n * 10n ** 17n, 3n * 10n ** 17n, 3n * 10n ** 17n].join(), "4 weights 40/30/30 set");
for (const [a, b] of pairs) await tx(M, { address: D.poolManager, abi: pm, functionName: "initialize", args: [[a, b, 0, 60, hook], 79228162514264337593543950336n] });
const poolLive = async ([a, b]) => {
  const id = keccak256(encodeAbiParameters([{ type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] }], [[a, b, 0, 60, hook]]));
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n]));
  return BigInt(await read(D.poolManager, pm, "extsload", [slot])) !== 0n;
};
const nonce0 = await read(hook, A.MohurHookAbi, "venueNonce");
const bal = (t, who = makerAcct.address) => read(t, A.MohurTestTokenAbi, "balanceOf", [who]);
async function shipVenues(split4 = 2n, splitA = 4n) {
  const n = await read(hook, A.MohurHookAbi, "venueNonce");
  const strat = await read(hook, A.MohurHookAbi, "strategy", [n]);
  await tx(M, { address: D.aqua, abi: A.AquaAbi, functionName: "ship", args: [hook, strat, toks, await Promise.all(toks.map(async (t) => (await bal(t)) / split4))] });
  for (const [a, b] of pairs) {
    const [, s] = await read(D.lens, A.MohurLensAbi, "activeAquaOrder", [hook, a, b]);
    await tx(M, { address: D.aqua, abi: A.AquaAbi, functionName: "ship", args: [D.swapVM, s, [a, b], [(await bal(a)) / splitA, (await bal(b)) / splitA]] });
  }
}
await shipVenues();
ok((await Promise.all(pairs.map(poolLive))).every(Boolean) && nonce0 === 0n, "5 three v4 pools open, Uniswap venue shipped");
const book = await read(D.lens, A.MohurLensAbi, "book", [hook, D.swapVM]);
ok(book.tokens.every((t) => t.v4Limit > 0n && t.aquaLimit > 0n), "6 1inch strategies shipped; both venues have limits for every coin");

// ------------------------------------------------------------------------------------------------
section("Swap (trader, both venues, 0.5% minimum received)");
for (const t of toks) {
  await tx(T, { address: t, abi: A.MohurTestTokenAbi, functionName: "faucet" });
  await tx(T, { address: t, abi: A.MohurTestTokenAbi, functionName: "approve", args: [D.loopRouter, maxUint256] });
}
for (const venue of [0, 1]) {
  const amt = parseUnits("1000", 6);
  const { result: q } = await pub.simulateContract({ address: D.lens, abi: A.MohurLensAbi, functionName: "quoteBoth", args: [hook, D.swapVM, D.tUSDC, D.tWETH, amt, true], account: traderAcct.address });
  const out = venue === 0 ? q[1] : q[4];
  ok(q[1] === q[4], `quote identical on both venues before the ${venue ? "1inch" : "Uniswap"} swap (${q[1]})`);
  const before = await bal(D.tWETH, traderAcct.address);
  await tx(T, { address: D.loopRouter, abi: A.MohurLoopRouterAbi, functionName: "execute", args: [hook, [D.tUSDC, D.tWETH], [venue], amt, (out * 995n) / 1000n, traderAcct.address] });
  const got = (await bal(D.tWETH, traderAcct.address)) - before;
  ok(got === out, `${venue ? "1inch Aqua" : "Uniswap v4"} swap delivered exactly the quote: ${got}`);
}

section("Same price on both venues after the fills (all 6 directions)");
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  if (i === j) continue;
  const amt = [10n ** 17n, 30000n, 300n * 10n ** 6n][i];
  const { result: q } = await pub.simulateContract({ address: D.lens, abi: A.MohurLensAbi, functionName: "quoteBoth", args: [hook, D.swapVM, toks[i], toks[j], amt, true], account: traderAcct.address });
  ok(q[1] === q[4] && q[2] && q[5], `${["ETH", "BTC", "USDC"][i]} -> ${["ETH", "BTC", "USDC"][j]}: ${q[1]} == ${q[4]}`);
}

// ------------------------------------------------------------------------------------------------
section("Arbitrage me (ETH -> USDC on Uniswap -> BTC on 1inch -> ETH on Uniswap)");
const path = [D.tWETH, D.tUSDC, D.tWBTC, D.tWETH], venues = [0, 1, 0], amtIn = 10n ** 17n;
const [quoted, within] = await read(D.lens, A.MohurLensAbi, "quoteRoute", [hook, D.swapVM, path, venues, amtIn]);
const wb = await bal(D.tWETH, traderAcct.address);
await tx(T, { address: D.loopRouter, abi: A.MohurLoopRouterAbi, functionName: "execute", args: [hook, path, venues, amtIn, 0n, traderAcct.address] });
const back = (await bal(D.tWETH, traderAcct.address)) - (wb - amtIn);
ok(within && back === quoted[3], `loop returned exactly its quote: ${back}`);
ok(back < amtIn, `and lost ${(Number(amtIn - back) / 1e13).toFixed(1)} bps`);

// ------------------------------------------------------------------------------------------------
section("My index: gradual re-weight 40/30/30 -> 50/25/25 over 1 hour");
await tx(M, { address: hook, abi: A.MohurHookAbi, functionName: "scheduleWeights", args: [[5n * 10n ** 17n, 25n * 10n ** 16n, 25n * 10n ** 16n], 3600n] });
await pub.request({ method: "evm_increaseTime", params: [1800] });
await pub.request({ method: "evm_mine", params: [] });
const mid = Number(await read(hook, A.MohurHookAbi, "weightOf", [D.tWETH])) / 1e16;
ok(Math.abs(mid - 45) < 0.2, `half-way, both venues price ETH at a ${mid.toFixed(2)}% weight`);

section("My index: pause both venues");
const b2 = await read(D.lens, A.MohurLensAbi, "book", [hook, D.swapVM]);
await tx(M, { address: D.aqua, abi: A.AquaAbi, functionName: "dock", args: [hook, b2.v4StrategyHash, toks] });
for (const p of b2.pairs) await tx(M, { address: D.aqua, abi: A.AquaAbi, functionName: "dock", args: [D.swapVM, p.aquaStrategyHash, [p.tokenA, p.tokenB]] });
for (const venue of [0, 1]) {
  const r = await reverts(T, { address: D.loopRouter, abi: A.MohurLoopRouterAbi, functionName: "execute", args: [hook, [D.tUSDC, D.tWETH], [venue], 10n ** 8n, 0n, traderAcct.address] });
  ok(r !== null, `${venue ? "1inch" : "Uniswap"} refuses trades while paused (${r})`);
}

section("My index: resume under a new epoch");
await tx(M, { address: hook, abi: A.MohurHookAbi, functionName: "setVenueNonce", args: [(await read(hook, A.MohurHookAbi, "venueNonce")) + 1n] });
await shipVenues();
{
  const { result: q } = await pub.simulateContract({ address: D.lens, abi: A.MohurLensAbi, functionName: "quoteBoth", args: [hook, D.swapVM, D.tUSDC, D.tWETH, 10n ** 8n, true], account: traderAcct.address });
  ok(q[2] && q[5] && q[1] === q[4], `both venues open again with identical quotes (${q[1]})`);
  await tx(T, { address: D.loopRouter, abi: A.MohurLoopRouterAbi, functionName: "execute", args: [hook, [D.tUSDC, D.tWETH], [1], 10n ** 8n, (q[4] * 995n) / 1000n, traderAcct.address] });
  ok(true, "a 1inch fill on the new epoch's order works");
}

// ------------------------------------------------------------------------------------------------
section("Friendly errors (what the app shows instead of a raw revert)");
const big = await reverts(T, { address: D.loopRouter, abi: A.MohurLoopRouterAbi, functionName: "execute", args: [hook, [D.tUSDC, D.tWETH], [0], parseUnits("20000", 6), 0n, traderAcct.address] });
ok(["MaxInRatio", "MaxOutRatio", "VenueLimit"].includes(big), `oversized trade decodes to ${big} -> "Trade too large..."`);
const tight = await reverts(T, { address: D.loopRouter, abi: A.MohurLoopRouterAbi, functionName: "execute", args: [hook, [D.tUSDC, D.tWETH], [0], 10n ** 8n, 10n ** 30n, traderAcct.address] });
ok(tight === "InsufficientOutput", `minimum-received guard decodes to ${tight} -> "The price moved..."`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
