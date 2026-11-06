"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { encodeAbiParameters, keccak256, maxUint256, parseAbi, type Address, type Hex } from "viem";
import { AquaAbi, MohurHookAbi, MohurHookFactoryAbi, MohurLensAbi, MohurTestTokenAbi } from "@/generated/abis";
import { deployment, NETWORK } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { hookOf, mineHookSalt, TOKEN_STYLE } from "@/lib/mohur";
import { loadDraft, type Draft } from "@/lib/draft";
import { useWallet } from "@/lib/wallet";
import { NotDeployed } from "@/components/NotDeployed";
import { Concept } from "@/components/Concept";
import { Explain } from "@/components/Explain";
import { GasHint } from "@/components/GasHint";

const pmAbi = parseAbi([
  "function initialize((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, uint160 sqrtPriceX96) returns (int24)",
  "function extsload(bytes32 slot) view returns (bytes32)",
]);
const SQRT_PRICE_1_1 = 79228162514264337593543950336n;
const keyTuple = [{ type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] }] as const;

type StepState = "todo" | "running" | "done";
const STEPS = [
  ["Deploy your hook", "Your own Uniswap v4 hook"],
  ["Get test tokens", "tWETH, tWBTC, tUSDC (no value)"],
  ["Approve Aqua only", "Your one and only approval"],
  ["Set weights", "Your mix + 0.30% fee"],
  ["Open on Uniswap", "One v4 pool per pair"],
  ["Open on 1inch", "One Aqua order per pair"],
] as const;

export default function LaunchPage() {
  const d = deployment();
  const w = useWallet();
  const [draft, setDraft] = useState<Draft>();
  const [hook, setHook] = useState<Address>();
  const [state, setState] = useState<StepState[]>(STEPS.map(() => "todo"));
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>();
  const [running, setRunning] = useState(false);

  useEffect(() => setDraft(loadDraft()), []);

  const tokens = d && draft ? (["tWETH", "tWBTC", "tUSDC"] as const).filter((s) => draft.weights[s] > 0).map((s) => ({ s, a: d[s] as Address })) : [];
  const pairs: [Address, Address][] = [];
  for (let i = 0; i < tokens.length; i++)
    for (let j = i + 1; j < tokens.length; j++) {
      const [x, y] = [tokens[i].a, tokens[j].a];
      pairs.push(x.toLowerCase() < y.toLowerCase() ? [x, y] : [y, x]);
    }
  const poolKey = (h: Address, [a, b]: [Address, Address]) => ({ currency0: a, currency1: b, fee: 0, tickSpacing: 60, hooks: h });

  /** Re-derive every step's status from chain state, so the flow resumes after a reload. */
  const refresh = useCallback(async () => {
    if (!d || !w.account || !draft) return;
    const c = readClient("launch status", keys.maker(w.account));
    const st: StepState[] = STEPS.map(() => "todo");
    const h = await hookOf(w.account);
    setHook(h);
    if (h) st[0] = "done";
    const bals = await Promise.all(tokens.map((t) => c.readContract({ address: t.a, abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account!] }) as Promise<bigint>));
    if (bals.every((b) => b > 0n)) st[1] = "done";
    const allow = await Promise.all(tokens.map((t) => c.readContract({ address: t.a, abi: MohurTestTokenAbi, functionName: "allowance", args: [w.account!, d.aqua] }) as Promise<bigint>));
    if (allow.every((a) => a > 0n)) st[2] = "done";
    if (h) {
      const ts = (await c.readContract({ address: h, abi: MohurHookAbi, functionName: "tokens" })) as Address[];
      if (ts.length === tokens.length) st[3] = "done";
      const sh = (await c.readContract({ address: h, abi: MohurHookAbi, functionName: "strategyHash" })) as Hex;
      const [, cnt] = (await c.readContract({ address: d.aqua, abi: AquaAbi, functionName: "rawBalances", args: [w.account, h, sh, tokens[0].a] })) as [bigint, number];
      let poolsOk = true;
      for (const p of pairs) {
        const id = keccak256(encodeAbiParameters(keyTuple, [[p[0], p[1], 0, 60, h]]));
        const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n]));
        const v = (await c.readContract({ address: d.poolManager, abi: pmAbi, functionName: "extsload", args: [slot] })) as Hex;
        if (BigInt(v) === 0n) poolsOk = false;
      }
      if (poolsOk && cnt > 0) st[4] = "done";
      let shipped = true;
      for (const p of pairs) {
        const [, , hash] = (await c.readContract({ address: d.lens, abi: MohurLensAbi, functionName: "activeAquaOrder", args: [h, p[0], p[1]] })) as [unknown, Hex, Hex];
        const [, n] = (await c.readContract({ address: d.aqua, abi: AquaAbi, functionName: "rawBalances", args: [w.account, d.swapVM, hash, p[0]] })) as [bigint, number];
        if (n === 0) shipped = false;
      }
      if (shipped) st[5] = "done";
    }
    setState(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, w.account, draft]);

  useEffect(() => {
    refresh().catch((e) => setErr(String(e.message ?? e)));
  }, [refresh]);

  const run = async (i: number) => {
    if (!d || !w.account || !draft) return;
    setRunning(true);
    setErr(undefined);
    setState((s) => s.map((x, k) => (k === i ? "running" : x)));
    const c = readClient("launch", keys.maker(w.account));
    try {
      if (i === 0) {
        setMsg("Mining a hook address with the right permission bits…");
        const { salt, address, tries } = await mineHookSalt(w.account, (n) => setMsg(`Mining hook address… ${n.toLocaleString()} salts tried`));
        setMsg(`Found ${address} after ${tries.toLocaleString()} tries. Deploying…`);
        await w.write({ address: d.hookFactory, abi: MohurHookFactoryAbi, functionName: "deploy", args: [salt], label: "deploy hook" });
      }
      if (i === 1) for (const t of tokens) { setMsg(`Faucet ${t.s}…`); await w.write({ address: t.a, abi: MohurTestTokenAbi, functionName: "faucet", label: `faucet ${t.s}` }); }
      if (i === 2) for (const t of tokens) { setMsg(`Approve Aqua for ${t.s}…`); await w.write({ address: t.a, abi: MohurTestTokenAbi, functionName: "approve", args: [d.aqua, maxUint256], label: `approve ${t.s}` }); }
      if (i === 3) {
        setMsg("Setting weights…");
        const weights = tokens.map((t) => BigInt(draft.weights[t.s]) * 10n ** 16n);
        await w.write({ address: hook!, abi: MohurHookAbi, functionName: "setIndex", args: [tokens.map((t) => t.a), weights, 3n * 10n ** 15n], label: "set weights" });
      }
      if (i === 4) {
        const h = hook!;
        for (const p of pairs) {
          const id = keccak256(encodeAbiParameters(keyTuple, [[p[0], p[1], 0, 60, h]]));
          const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n]));
          const v = (await c.readContract({ address: d.poolManager, abi: pmAbi, functionName: "extsload", args: [slot] })) as Hex;
          if (BigInt(v) !== 0n) continue;
          setMsg("Opening Uniswap v4 pool…");
          await w.write({ address: d.poolManager, abi: pmAbi, functionName: "initialize", args: [poolKey(h, p), SQRT_PRICE_1_1], label: "open v4 pool" });
        }
        setMsg("Shipping the Uniswap venue's Aqua strategy…");
        const nonce = (await c.readContract({ address: h, abi: MohurHookAbi, functionName: "venueNonce" })) as bigint;
        const strat = (await c.readContract({ address: h, abi: MohurHookAbi, functionName: "strategy", args: [nonce] })) as Hex;
        const amts = await Promise.all(tokens.map(async (t) => ((await c.readContract({ address: t.a, abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account!] })) as bigint) / 2n));
        await w.write({ address: d.aqua, abi: AquaAbi, functionName: "ship", args: [h, strat, tokens.map((t) => t.a), amts], label: "ship Uniswap venue" });
      }
      if (i === 5) {
        for (const p of pairs) {
          const [, strat] = (await c.readContract({ address: d.lens, abi: MohurLensAbi, functionName: "activeAquaOrder", args: [hook!, p[0], p[1]] })) as [unknown, Hex, Hex];
          const amts = await Promise.all(p.map(async (a) => ((await c.readContract({ address: a, abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account!] })) as bigint) / 4n));
          setMsg("Shipping 1inch Aqua strategy…");
          await w.write({ address: d.aqua, abi: AquaAbi, functionName: "ship", args: [d.swapVM, strat, [p[0], p[1]], amts], label: "ship Aqua strategy" });
        }
      }
      setMsg("");
    } catch (e) {
      setErr(String((e as Error).message).slice(0, 300));
    }
    await refresh().catch(() => {});
    setRunning(false);
  };

  if (!d) return <NotDeployed />;
  const next = state.findIndex((s) => s !== "done");

  return (
    <div className="wrap page">
      <GasHint />
      <div className="page-head">
        <div className="eyebrow">Step 2 · Launch</div>
        <h2>Six clicks to go live</h2>
        <p>
          {tokens.map((t) => `${draft?.weights[t.s]}% ${TOKEN_STYLE[t.s].name}`).join(" · ")} · <Link href="/create" className="gold">edit</Link>
        </p>
      </div>
      <Concept caption={<><b>Coins stay in your wallet</b> until someone buys them.</>} />
      <p className="faint" style={{ fontSize: 14, marginTop: -8 }}>Tip: use a separate wallet just for this.</p>
      {!w.account && <div className="banner">Connect a wallet to launch{NETWORK === "local" ? " (on the local fork, use Dev #3 for a fresh maker)" : ""}.</div>}
      <div className="stack" style={{ marginTop: 16 }}>
        {STEPS.map(([title, body], i) => (
          <div key={title} className="card spread" data-testid={`launch-step-${i}`} data-state={state[i]} style={{ opacity: state[i] === "done" ? 0.7 : 1, borderColor: i === next ? "var(--gold)" : undefined }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="row">
                <span className="mono faint">{i + 1}</span>
                <h3 style={{ margin: 0 }}>{title}</h3>
                {state[i] === "done" && <span className="tag live">done</span>}
              </div>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>{body}</p>
              {i === 0 && hook && <p className="addr faint" style={{ fontSize: 12, margin: "6px 0 0" }}>hook {hook}</p>}
            </div>
            <button className={`btn ${i === next ? "primary" : ""}`} data-testid={`launch-run-${i}`} disabled={!w.account || running || state[i] === "done" || i !== next} onClick={() => run(i)}>
              {state[i] === "running" ? "Working…" : state[i] === "done" ? "Done" : "Run"}
            </button>
          </div>
        ))}
      </div>
      {msg && <p className="muted mono" style={{ fontSize: 13 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
      {next === -1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 data-testid="launch-done">Your index is live on both venues.</h3>
          <p className="muted">Same price on Uniswap and 1inch.</p>
          <Link href="/book" className="btn primary">Open the live book →</Link>
        </div>
      )}
      <Explain anchor="11-launching-an-index" points={[
        "Six transactions turn this wallet into an index quoted on both venues. Reload any time: the flow resumes from chain state.",
        "Your browser mines the hook's address so it carries Uniswap v4's permission bits.",
        "The wallet's only approval is to 1inch Aqua. Not the hook, router or PoolManager.",
      ]} />
    </div>
  );
}
