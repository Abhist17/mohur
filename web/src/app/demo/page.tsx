"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, maxUint256, type Address, type Hash } from "viem";
import { MohurLoopRouterAbi, MohurTestTokenAbi } from "@/generated/abis";
import { deployment, EXPLORER, NETWORK } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { quoteBoth, quoteRoute } from "@/lib/mohur";
import { useWallet } from "@/lib/wallet";
import { useIndex } from "@/components/useIndex";
import { NotDeployed } from "@/components/NotDeployed";
import { VenueLogo } from "@/components/VenueMark";

/**
 * Guided demo: six real steps against the demo index from the connected wallet.
 * Idempotent: every step first checks chain state (balance, allowance) and skips if already done.
 * Resumable: trade tx hashes are saved per wallet + index, so a reload continues where it stopped.
 */
type StepId = "faucet" | "approve" | "quote" | "v4" | "aqua" | "loop";
type Result = { done: boolean; text?: string; tx?: Hash; skipped?: boolean };
const STEPS: { id: StepId; title: string; what: string }[] = [
  { id: "faucet", title: "Get test tokens", what: "Mints test ETH, BTC and USDC to your wallet (no value)." },
  { id: "approve", title: "Approve the router", what: "Lets the trade router spend your test USDC and ETH." },
  { id: "quote", title: "Quote both venues", what: "Same trade, Uniswap v4 vs 1inch Aqua, one eth_call." },
  { id: "v4", title: "Trade on Uniswap v4", what: "Sell 100 USDC for ETH through the Mohur hook." },
  { id: "aqua", title: "Trade on 1inch Aqua", what: "Sell 100 USDC for ETH through SwapVM opcode 0xd0." },
  { id: "loop", title: "Try to arbitrage", what: "Quote ETH → USDC → BTC → ETH across both venues." },
];
const TRADE = 100_000_000n; // 100 tUSDC
const e = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumSignificantDigits: 7 });

export default function DemoPage() {
  const d = deployment();
  const w = useWallet();
  const idx = useIndex(true);
  const hook = d?.demoHook;
  const storeKey = w.account && hook ? `mohur.demo:${NETWORK}:${hook}:${w.account}`.toLowerCase() : undefined;
  const [res, setRes] = useState<Partial<Record<StepId, Result>>>({});
  const [running, setRunning] = useState<StepId>();
  const [err, setErr] = useState<string>();

  // resume saved progress for this wallet + index
  useEffect(() => {
    if (!storeKey) return setRes({});
    try {
      setRes(JSON.parse(localStorage.getItem(storeKey) ?? "{}"));
    } catch {
      setRes({});
    }
  }, [storeKey]);
  const save = useCallback(
    (id: StepId, r: Result) =>
      setRes((prev) => {
        const next = { ...prev, [id]: r };
        try {
          if (storeKey) localStorage.setItem(storeKey, JSON.stringify(next));
        } catch {}
        return next;
      }),
    [storeKey],
  );

  if (!d || !hook) return <NotDeployed />;
  const tok = { weth: d.tWETH, wbtc: d.tWBTC, usdc: d.tUSDC };

  const run = async (id: StepId) => {
    if (!w.account) return;
    const me = w.account;
    const rc = readClient(`demo: ${id}`, keys.trader(me));
    const bal = (t: Address) => rc.readContract({ address: t, abi: MohurTestTokenAbi, functionName: "balanceOf", args: [me] }) as Promise<bigint>;
    const allowance = (t: Address) => rc.readContract({ address: t, abi: MohurTestTokenAbi, functionName: "allowance", args: [me, d.loopRouter] }) as Promise<bigint>;
    setRunning(id);
    setErr(undefined);
    try {
      if (id === "faucet") {
        let minted = 0;
        for (const t of [tok.usdc, tok.weth, tok.wbtc]) {
          if ((await bal(t)) > 0n) continue; // idempotent: already holding
          await w.write({ address: t, abi: MohurTestTokenAbi, functionName: "faucet", label: "Get test tokens" });
          minted++;
        }
        const u = await bal(tok.usdc);
        save(id, { done: true, skipped: minted === 0, text: `${Number(formatUnits(u, 6)).toLocaleString()} test USDC in wallet` });
      } else if (id === "approve") {
        let sent = 0;
        for (const t of [tok.usdc, tok.weth]) {
          if ((await allowance(t)) > 10n ** 30n) continue;
          await w.write({ address: t, abi: MohurTestTokenAbi, functionName: "approve", args: [d.loopRouter, maxUint256], label: "Approve router" });
          sent++;
        }
        save(id, { done: true, skipped: sent === 0, text: sent ? `${sent} approval(s) sent` : "already approved" });
      } else if (id === "quote") {
        const q = await quoteBoth(hook, tok.usdc, tok.weth, TRADE);
        const diff = q.v4Out > q.aquaOut ? q.v4Out - q.aquaOut : q.aquaOut - q.v4Out;
        save(id, { done: true, text: `Uniswap ${e(q.v4Out)} ETH · 1inch ${e(q.aquaOut)} ETH · difference ${diff} wei` });
      } else if (id === "v4" || id === "aqua") {
        const venue = id === "v4" ? 0 : 1;
        const q = await quoteBoth(hook, tok.usdc, tok.weth, TRADE);
        const out = venue === 0 ? q.v4Out : q.aquaOut;
        const before = await bal(tok.weth);
        const tx = await w.write({
          address: d.loopRouter,
          abi: MohurLoopRouterAbi,
          functionName: "execute",
          args: [hook, [tok.usdc, tok.weth], [venue], TRADE, (out * 995n) / 1000n, me],
          label: id === "v4" ? "Demo trade on Uniswap v4" : "Demo trade on 1inch Aqua",
        });
        const got = (await bal(tok.weth)) - before;
        save(id, { done: true, tx, text: `100 USDC → ${e(got)} ETH (quoted ${e(out)})` });
      } else if (id === "loop") {
        const one = 10n ** 18n;
        const r = await quoteRoute(hook, [tok.weth, tok.usdc, tok.wbtc, tok.weth], [0, 1, 0], one, me);
        const end = r.amounts[r.amounts.length - 1];
        const pct = ((Number(end) / 1e18 - 1) * 100).toFixed(3);
        save(id, { done: true, text: `1 ETH → ${e(end)} ETH (${pct}%): the loop loses` });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(undefined);
    }
  };

  const next = STEPS.find((s) => !res[s.id]?.done);
  const runAll = async () => {
    for (const s of STEPS) if (!res[s.id]?.done) await run(s.id);
  };
  const reset = () => {
    try {
      if (storeKey) localStorage.removeItem(storeKey);
    } catch {}
    setRes({});
  };

  return (
    <div className="wrap page">
      <div className="page-head">
        <div className="eyebrow">Demo mode</div>
        <h2>Run the demo</h2>
        <p>Six real steps against the demo index, from your wallet. Test tokens only.</p>
      </div>
      <div className="card stack" data-testid="demo-banner" style={{ borderStyle: "dashed" }}>
        <div className="spread">
          <b>Demo mode · {NETWORK === "local" ? "local fork" : "Base Sepolia testnet"}</b>
          <span className="tag live">real transactions</span>
        </div>
        <span className="muted">
          Every number below is read from chain after the step runs. Safe to rerun: done steps are skipped, progress is saved in this browser.
          {idx.hook && idx.hook !== hook && " (The demo always uses the demo index.)"}
        </span>
      </div>

      {!w.account ? (
        <div className="card">Connect a wallet to start{NETWORK === "local" && " (on the local fork, pick Dev #2 (trader))"}.</div>
      ) : (
        <>
          <div className="row" style={{ margin: "16px 0" }}>
            <button className="btn primary" data-testid="demo-run" disabled={!!running || !next} onClick={runAll}>
              {running ? "Running…" : !next ? "All done" : Object.keys(res).length ? "Resume the demo" : "Run the demo"}
            </button>
            <button className="btn small" onClick={reset} disabled={!!running}>Start over</button>
          </div>
          <div className="stack">
            {STEPS.map((s, i) => {
              const r = res[s.id];
              return (
                <div key={s.id} className="card" data-testid={`demo-step-${s.id}`} data-done={r?.done ? "1" : "0"}>
                  <div className="spread">
                    <div>
                      <b>{i + 1}. {s.title}</b>{" "}
                      {(s.id === "v4" || s.id === "aqua") && <VenueLogo venue={s.id === "v4" ? 0 : 1} size={16} />}
                      <div className="faint" style={{ fontSize: 13 }}>{s.what}</div>
                    </div>
                    {r?.done ? (
                      <span className="tag live">{r.skipped ? "already done" : "done"}</span>
                    ) : (
                      <button className="btn small" disabled={!!running} onClick={() => run(s.id)}>
                        {running === s.id ? "Running…" : "Run"}
                      </button>
                    )}
                  </div>
                  {r?.text && <div className="mono num" style={{ marginTop: 8, fontSize: 13 }} data-testid={`demo-out-${s.id}`}>{r.text}</div>}
                  {r?.tx && (
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {EXPLORER ? <a href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer">View transaction ↗</a> : <span className="faint mono">tx {r.tx.slice(0, 10)}…</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
          {!next && (
            <p style={{ marginTop: 16 }}>
              See your fills on the <Link href={`/book?index=${hook}`}>Live book</Link>, or try your own loop on <Link href="/arbitrage">Arbitrage me</Link>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
