"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, maxUint256, parseEventLogs, type Address, type Hash } from "viem";
import { TenbinLoopRouterAbi, TenbinTestTokenAbi } from "@/generated/abis";
import { deployment, EXPLORER, NETWORK } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { amt, fillEvt, quoteBoth, quoteRoute, swappedEvt } from "@/lib/tenbin";
import { useWallet } from "@/lib/wallet";
import { useIndex } from "@/components/useIndex";
import { NotDeployed } from "@/components/NotDeployed";
import { VenueLogo } from "@/components/VenueMark";
import { Explain } from "@/components/Explain";
import { GasHint } from "@/components/GasHint";

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
  { id: "v4", title: "Trade on Uniswap v4", what: "Sell 100 USDC for ETH through the Tenbin hook." },
  { id: "aqua", title: "Trade on 1inch Aqua", what: "Sell 100 USDC for ETH through SwapVM opcode 0xd0." },
  { id: "loop", title: "Try to arbitrage", what: "Quote ETH → USDC → BTC → ETH across both venues." },
];
const TRADE = 100_000_000n; // 100 tUSDC
const e = (v: bigint) => amt(v, 18, 7);

export default function DemoPage() {
  const d = deployment();
  const w = useWallet();
  const idx = useIndex(true);
  const hook = d?.demoHook;
  // progress belongs to one deployment: a re-created local chain can reuse the same addresses, so the start block is in the key
  const storeKey = w.account && hook ? `tenbin.demo:${NETWORK}:${d?.startBlock}:${hook}:${w.account}`.toLowerCase() : undefined;
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

  /** Runs one step; returns false if it failed (the error is shown and Run the demo stops there). */
  const run = async (id: StepId): Promise<boolean> => {
    if (!w.account) return false;
    const me = w.account;
    const rc = readClient(`demo: ${id}`, keys.trader(me));
    const bal = (t: Address) => rc.readContract({ address: t, abi: TenbinTestTokenAbi, functionName: "balanceOf", args: [me] }) as Promise<bigint>;
    const allowance = (t: Address) => rc.readContract({ address: t, abi: TenbinTestTokenAbi, functionName: "allowance", args: [me, d.loopRouter] }) as Promise<bigint>;
    setRunning(id);
    setErr(undefined);
    try {
      if (id === "faucet") {
        let minted = 0;
        for (const t of [tok.usdc, tok.weth, tok.wbtc]) {
          if ((await bal(t)) > 0n) continue; // idempotent: already holding
          await w.write({ address: t, abi: TenbinTestTokenAbi, functionName: "faucet", label: "Get test tokens" });
          minted++;
        }
        const u = await bal(tok.usdc);
        save(id, { done: true, skipped: minted === 0, text: `${Number(formatUnits(u, 6)).toLocaleString()} test USDC in wallet` });
      } else if (id === "approve") {
        let sent = 0;
        for (const t of [tok.usdc, tok.weth]) {
          if ((await allowance(t)) > 10n ** 30n) continue;
          await w.write({ address: t, abi: TenbinTestTokenAbi, functionName: "approve", args: [d.loopRouter, maxUint256], label: "Approve router" });
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
        const tx = await w.write({
          address: d.loopRouter,
          abi: TenbinLoopRouterAbi,
          functionName: "execute",
          args: [hook, [tok.usdc, tok.weth], [venue], TRADE, (out * 995n) / 1000n, me],
          label: id === "v4" ? "Demo trade on Uniswap v4" : "Demo trade on 1inch Aqua",
        });
        // exact amount from the trade's own event (Fill on Uniswap, Swapped on 1inch), not a balance read a lagging RPC could get wrong
        const rcpt = await rc.getTransactionReceipt({ hash: tx });
        const fills = parseEventLogs({ abi: [fillEvt, swappedEvt], logs: rcpt.logs });
        const got = fills.map((l) => l.args as { tokenOut: Address; amountOut: bigint }).find((a) => a.tokenOut.toLowerCase() === tok.weth.toLowerCase())?.amountOut;
        save(id, { done: true, tx, text: got !== undefined ? `100 USDC → ${e(got)} ETH (quoted ${e(out)})` : `100 USDC → ETH (quoted ${e(out)})` });
      } else if (id === "loop") {
        const one = 10n ** 18n;
        const r = await quoteRoute(hook, [tok.weth, tok.usdc, tok.wbtc, tok.weth], [0, 1, 0], one, me);
        const end = r.amounts[r.amounts.length - 1];
        const pct = ((Number(end) / 1e18 - 1) * 100).toFixed(3);
        save(id, { done: true, text: `1 ETH → ${e(end)} ETH (${pct}%): the loop loses` });
      }
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setRunning(undefined);
    }
  };

  const next = STEPS.find((s) => !res[s.id]?.done);
  const doneCount = STEPS.filter((s) => res[s.id]?.done).length;
  // the three things the demo proves, read back from the saved step results (works for progress saved earlier too)
  const gap = res.quote?.text?.match(/difference (\d+) wei/)?.[1];
  const exactOf = (id: StepId) => {
    const m = res[id]?.text?.match(/→ ([\d.,]+) ETH \(quoted ([\d.,]+)\)/);
    return m ? m[1] === m[2] : undefined;
  };
  const exact = [exactOf("v4"), exactOf("aqua")].filter((x) => x !== undefined) as boolean[];
  const loopPct = res.loop?.text?.match(/\((-?[\d.]+)%\)/)?.[1];
  const proofs = [
    { id: "gap", label: "Price gap between venues", value: gap !== undefined ? `${gap} wei` : "–", sub: "the same trade, quoted on Uniswap and 1inch", ok: gap === "0" },
    {
      id: "exact",
      label: "Received vs quoted",
      value: exact.length === 0 ? "–" : exact.every(Boolean) ? (exact.length === 2 ? "Exact" : "Exact (1 of 2)") : "Differs",
      sub: "both real trades paid exactly their quote",
      ok: exact.length === 2 && exact.every(Boolean),
    },
    { id: "loop", label: "Arbitrage loop", value: loopPct !== undefined ? `${loopPct.replace("-", "−")}%` : "–", sub: "ETH → USDC → BTC → ETH across both venues", ok: loopPct !== undefined && Number(loopPct) < 0 },
  ];
  const runAll = async () => {
    for (const s of STEPS) if (!res[s.id]?.done && !(await run(s.id))) break; // stop at the first failure: no cascade of failing wallet prompts
  };
  const reset = () => {
    try {
      if (storeKey) localStorage.removeItem(storeKey);
    } catch {}
    setRes({});
  };

  return (
    <div className="wrap page">
      <GasHint />
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
            <span className="faint" style={{ fontSize: 13, marginLeft: "auto" }} data-testid="demo-progress">{doneCount} of {STEPS.length} steps</span>
          </div>
          <div className="bar" style={{ height: 6, marginBottom: 16 }} aria-hidden="true">
            <span style={{ width: `${(doneCount / STEPS.length) * 100}%`, background: "var(--accent-fill)" }} />
          </div>
          <div className="grid g3" style={{ marginBottom: 16 }} data-testid="demo-proofs">
            {proofs.map((p) => (
              <div key={p.id} className={`card demo-proof${p.ok ? " ok" : ""}`} data-testid={`demo-proof-${p.id}`}>
                <div className="faint" style={{ fontSize: 12.5, fontWeight: 500 }}>{p.label}</div>
                <div className="serif" style={{ fontSize: 34, lineHeight: 1.15 }}>{p.value}</div>
                <div className="faint" style={{ fontSize: 12.5 }}>{p.sub}</div>
              </div>
            ))}
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
                  {r?.text && <div className="demo-result" data-testid={`demo-out-${s.id}`}>{r.text}</div>}
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
      <Explain anchor="2-the-idea-one-stockroom-two-stalls" points={[
        "The same story as ./scripts/demo.sh, from your own wallet: tokens, approval, parity check, one trade per venue, a losing loop.",
        "Safe to rerun: steps already done on chain are skipped.",
      ]} />
    </div>
  );
}
