"use client";

import Link from "next/link";
import { useState } from "react";
import { parseUnits, type Address } from "viem";
import { MohurHookAbi } from "@/generated/abis";
import { deployment, EXPLORER, NETWORK } from "@/lib/config";
import { fmt, quoteBoth, readBook, readFills, TOKEN_STYLE, units, type Book, type FillRow } from "@/lib/mohur";
import { useWallet } from "@/lib/wallet";
import { usePoll, useIndex } from "@/components/useIndex";
import { NotDeployed } from "@/components/NotDeployed";
import { TokenIcon } from "@/components/TokenIcon";
import { Concept } from "@/components/Concept";
import { VenueMark, venueIndex } from "@/components/VenueMark";
import { Explain } from "@/components/Explain";

type PairQuote = { a: Address; b: Address; amt: string; v4Out: bigint; aquaOut: bigint; v4Ok: boolean; aquaOk: boolean };

export default function BookPage() {
  const { hook, maker, isOwn, deployed } = useIndex();
  const w = useWallet();
  const [book, setBook] = useState<Book>();
  const [fills, setFills] = useState<FillRow[]>([]);
  const [quotes, setQuotes] = useState<PairQuote[]>([]);
  const [px, setPx] = useState<Record<string, number>>({ tWETH: 4000, tWBTC: 100000, tUSDC: 1 });
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  usePoll(
    async () => {
      if (!hook || !maker) return;
      try {
        const b = await readBook(hook, maker);
        setBook(b);
        // independent reads in parallel: over a mixnet each one costs seconds (each keeps its own isolation key)
        const [qs, f] = await Promise.all([
          Promise.all(
            b.pairs.map(async (p): Promise<PairQuote> => {
              const ta = b.tokens.find((t) => t.token === p.tokenA)!;
              const tb = b.tokens.find((t) => t.token === p.tokenB)!;
              const amt = ta.symbol === "tWETH" ? "0.1" : ta.symbol === "tWBTC" ? "0.003" : "300";
              const q = await quoteBoth(hook, ta.token, tb.token, parseUnits(amt, ta.decimals));
              return { a: ta.token, b: tb.token, amt, v4Out: q.v4Out, aquaOut: q.aquaOut, v4Ok: q.v4Ok, aquaOk: q.aquaOk };
            }),
          ),
          readFills(hook, maker),
        ]);
        setQuotes(qs);
        setFills(f);
        setErr(undefined);
      } catch (e) {
        setErr((e as Error).message.slice(0, 200));
      }
    },
    NETWORK === "local" ? 5000 : 20000,
    [hook, maker],
  );

  if (!deployed) return <NotDeployed />;
  if (!hook) return <div className="wrap page">No index yet. <Link className="gold" href="/create">Launch one →</Link></div>;

  const sym = (a: Address) => book?.tokens.find((t) => t.token === a)?.symbol ?? a.slice(0, 6);
  /** display name (ETH / BTC / USDC) for a token address */
  const nm = (a: Address) => TOKEN_STYLE[sym(a)]?.name ?? sym(a);
  const dec = (a: Address) => book?.tokens.find((t) => t.token === a)?.decimals ?? 18;
  const values = book?.tokens.map((t) => units(t.effectiveBalance, t.decimals) * (px[t.symbol] ?? 0)) ?? [];
  const total = values.reduce((a, b) => a + b, 0);
  const pendingAny = book?.tokens.some((t) => t.pending > 0n);
  const feeRate = book ? Number(book.fee) / 1e18 : 0.003;
  const feesBy: Record<string, number> = {};
  for (const f of fills) feesBy[sym(f.tokenIn)] = (feesBy[sym(f.tokenIn)] ?? 0) + units(f.amountIn, dec(f.tokenIn)) * feeRate;
  const feesUsd = Object.entries(feesBy).reduce((a, [s, v]) => a + v * (px[s] ?? 0), 0);

  // Self-rebalancing, live: at the market prices typed above, where does arbitrage take the wallet?
  // Fee-free equilibrium of the weighted invariant prod(B_i^w_i): B_i* = w_i * K / p_i with K = Inv / prod((w_i/p_i)^w_i).
  // The trader's profit is the wallet's value now minus at equilibrium (>= 0 by AM-GM), before fees.
  const rb = (() => {
    if (!book || book.tokens.length < 2) return undefined;
    const t = book.tokens.map((x) => ({ sym: x.symbol, b: units(x.effectiveBalance, x.decimals), w: Number(x.weight) / 1e18, p: px[x.symbol] ?? 0 }));
    if (t.some((x) => !(x.p > 0) || !(x.b > 0))) return undefined;
    const lnInv = t.reduce((a, x) => a + x.w * Math.log(x.b), 0);
    const lnK = lnInv - t.reduce((a, x) => a + x.w * Math.log(x.w / x.p), 0);
    const K = Math.exp(lnK);
    const rows = t.map((x) => ({ ...x, target: (x.w * K) / x.p, delta: (x.w * K) / x.p - x.b }));
    const v0 = t.reduce((a, x) => a + x.b * x.p, 0);
    // below a cent the gap is float noise from the log/exp round trip, not an opportunity
    const dust = (x: number) => (Math.abs(x) < 0.01 ? 0 : x);
    const profit = dust(v0 - K);
    const over = rows.reduce((a, r) => (r.delta * r.p < a.delta * a.p ? r : a)); // wallet sells most of this
    const under = rows.reduce((a, r) => (r.delta * r.p > a.delta * a.p ? r : a)); // wallet wants this
    const feeCost = rows.reduce((a, r) => a + Math.max(0, r.delta) * r.p, 0) * feeRate;
    return { rows, profit, net: dust(profit - feeCost), over, under, v0 };
  })();

  const flush = async () => {
    setBusy(true);
    try {
      await w.write({ address: hook, abi: MohurHookAbi, functionName: "flush", label: "flush claims" });
    } catch (e) {
      setErr((e as Error).message.slice(0, 200));
    }
    setBusy(false);
  };

  return (
    <div className="wrap page">
      <div className="page-head spread">
        <div>
          <div className="eyebrow">Live book {isOwn ? "· your index" : hook.toLowerCase() === deployment()?.demoHook?.toLowerCase() ? "· demo index" : "· picked index"}</div>
          <h2>One wallet, two venues</h2>
          <p className="row" style={{ gap: 10, fontSize: 14 }}>
            <span>hook <span className="addr">{hook.slice(0, 10)}…</span></span>
            <span>maker <span className="addr">{maker?.slice(0, 10)}…</span></span>
            <span>fee {(feeRate * 100).toFixed(2)}%</span>
            {NETWORK === "base-sepolia" && <span className="good">● via Anon-RPC</span>}
          </p>
        </div>
        <div className="row">
          <span className="tag live">live</span>
          <Link href={`/share?index=${hook}`} className="btn small" data-testid="book-share">Share</Link>
          <Link href={`/swap?index=${hook}`} className="btn small primary" data-testid="book-trade">Trade</Link>
        </div>
      </div>
      <Concept highlight="wallet" caption={<><b>The stockroom.</b> Both stalls sell from this shelf.</>} />
      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="grid g2">
        <div className="card">
          <div className="spread">
            <h3>Weights vs target</h3>
            <span className="faint" style={{ fontSize: 12 }}>drift at the prices you type in</span>
          </div>
          <div className="row" style={{ margin: "10px 0 16px" }}>
            {["tWETH", "tWBTC"].map((s) => (
              <label key={s} className="row" style={{ gap: 6, fontSize: 13 }}>
                {TOKEN_STYLE[s].name} $
                <input type="number" value={px[s]} style={{ width: 110 }} onChange={(e) => setPx({ ...px, [s]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          {!book && [0, 1, 2].map((i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <span className="skel" style={{ width: "40%" }} />
              <span className="skel" style={{ height: 8, marginTop: 10 }} />
            </div>
          ))}
          {book?.tokens.map((t, i) => {
            const actual = total ? values[i] / total : 0;
            const target = Number(t.weight) / 1e18;
            return (
              <div key={t.token} style={{ marginBottom: 14 }}>
                <div className="spread" style={{ fontSize: 14 }}>
                  <span className="row" style={{ gap: 8 }}><TokenIcon symbol={t.symbol} size={18} /> {TOKEN_STYLE[t.symbol]?.name ?? t.symbol} <span className="faint mono" style={{ fontSize: 12 }}>{t.symbol}</span></span>
                  <span className="mono">
                    {(actual * 100).toFixed(2)}% <span className="faint">/ {(target * 100).toFixed(0)}%</span>{" "}
                    <span className={Math.abs(actual - target) < 0.005 ? "good" : "bad"}>
                      {actual - target >= 0 ? "+" : ""}{((actual - target) * 100).toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="bar" style={{ marginTop: 6 }}>
                  <span style={{ width: `${actual * 100}%`, background: TOKEN_STYLE[t.symbol]?.color }} />
                </div>
                <div className="faint mono" style={{ fontSize: 12, marginTop: 4 }}>
                  {fmt(units(t.walletBalance, t.decimals))} in wallet
                  {t.pending > 0n && ` + ${fmt(units(t.pending, t.decimals))} as claims`} · ${fmt(values[i])}
                </div>
              </div>
            );
          })}
          <div className="spread" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <span className="muted">Total</span>
            <span className="mono">${fmt(total)}</span>
          </div>
        </div>

        <div className="card">
          <h3>Same quote on both venues</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Both venues call one price() over the same balances.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Sell</th><th className="num"><VenueMark venue={0} size={14} short /></th><th className="num"><VenueMark venue={1} size={14} short /></th><th className="num">Δ</th></tr>
              </thead>
              <tbody>
                {quotes.length === 0 && [0, 1, 2].map((i) => (
                  <tr key={i}><td colSpan={4}><span className="skel" /></td></tr>
                ))}
                {quotes.map((q) => (
                  <tr key={q.a + q.b} data-testid="quote-row" data-pair={`${sym(q.a)}/${sym(q.b)}`} data-v4={String(q.v4Out)} data-aqua={String(q.aquaOut)} data-ok={String(q.v4Ok && q.aquaOk)}>
                    <td>{q.amt} {nm(q.a)} → {nm(q.b)}</td>
                    <td className="num">{q.v4Ok ? fmt(units(q.v4Out, dec(q.b)), 8) : <span className="faint">limit</span>}</td>
                    <td className="num">{q.aquaOk ? fmt(units(q.aquaOut, dec(q.b)), 8) : <span className="faint">limit</span>}</td>
                    <td className="num good">{q.v4Ok && q.aquaOk ? (q.v4Out - q.aquaOut).toString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12 }}>Δ in smallest units.</p>
        </div>
      </div>

      {rb && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="spread">
            <div>
              <h3>Rebalancing, live</h3>
              <p className="muted" style={{ fontSize: 14, margin: "4px 0 0", maxWidth: 640 }}>
                {rb.net > 0 ? "Off target at these prices. Traders get paid to fix it." : "On target at these prices."}
              </p>
            </div>
            <span className={`tag ${rb.net > 0 ? "live" : ""}`}>{rb.net > 0 ? "opportunity open" : "on target"}</span>
          </div>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Asset</th><th className="num">Holds now</th><th className="num">At target</th><th className="num">Wallet will</th></tr></thead>
              <tbody>
                {rb.rows.map((r) => (
                  <tr key={r.sym}>
                    <td><span className="row" style={{ gap: 8 }}><TokenIcon symbol={r.sym} size={18} />{TOKEN_STYLE[r.sym]?.name}</span></td>
                    <td className="num">{fmt(r.b)}</td>
                    <td className="num">{fmt(r.target)}</td>
                    <td className={`num ${Math.abs(r.delta * r.p) < 1 ? "faint" : r.delta > 0 ? "good" : "bad"}`}>
                      {Math.abs(r.delta * r.p) < 1 ? "hold" : r.delta > 0 ? `buy ${fmt(r.delta)}` : `sell ${fmt(-r.delta)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="spread" style={{ marginTop: 14 }}>
            <span className="muted" style={{ fontSize: 14 }}>
              Arbitrage available ≈ <b className="gold">${fmt(Math.max(0, rb.profit))}</b> before fees,{" "}
              <b className={rb.net > 0 ? "good" : "faint"}>${fmt(Math.max(0, rb.net))}</b> after the 0.30% fee. The fee goes to the wallet.
            </span>
            {rb.net > 0 && rb.under.delta > 0 && (
              <Link
                className="btn small primary"
                href={`/swap?in=${rb.under.sym}&out=${rb.over.sym}&amount=${Number(Math.min(rb.under.delta, rb.under.b * 0.29).toPrecision(4)).toString()}$&index=${hook}`}
              >
                Be that trader: pay {TOKEN_STYLE[rb.under.sym]?.name}, get {TOKEN_STYLE[rb.over.sym]?.name} →
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Venue limits</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>What each venue may still sell.</p>
          <table>
            <thead><tr><th>Token</th><th className="num">Uniswap</th><th className="num">1inch</th><th className="num">Wallet</th></tr></thead>
            <tbody>
              {book?.tokens.map((t) => (
                <tr key={t.token} data-testid="limit-row" data-token={t.token} data-v4={String(t.v4Limit)} data-aqua={String(t.aquaLimit)} data-pending={String(t.pending)}>
                  <td><span className="row" style={{ gap: 8 }}><TokenIcon symbol={t.symbol} size={18} />{TOKEN_STYLE[t.symbol]?.name}</span></td>
                  <td className="num">{fmt(units(t.v4Limit, t.decimals))}</td>
                  <td className="num">{fmt(units(t.aquaLimit, t.decimals))}</td>
                  <td className="num">{fmt(units(t.walletBalance, t.decimals))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="spread" style={{ marginTop: 14 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {pendingAny ? "Uniswap input is waiting as claims (already priced in)." : "No claims waiting."}
            </span>
            <button className="btn small" data-testid="flush" disabled={!pendingAny || !w.account || busy} onClick={flush}>
              {busy ? "Flushing…" : "Flush claims → wallet"}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="spread">
            <h3>Fills, both venues</h3>
            <span className="mono gold">fees ≈ ${fmt(feesUsd)}</span>
          </div>
          <div className="table-scroll" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table>
              <thead><tr><th>Venue</th><th>Trade</th><th className="num">Block</th></tr></thead>
              <tbody>
                {fills.length === 0 && <tr><td colSpan={3} className="faint">No fills yet.</td></tr>}
                {fills.slice(0, 50).map((f) => (
                  <tr key={f.tx + f.venue + f.amountIn}>
                    <td><VenueMark venue={venueIndex(f.venue)} size={16} short /></td>
                    <td className="mono" style={{ fontSize: 13 }}>
                      {fmt(units(f.amountIn, dec(f.tokenIn)))} {nm(f.tokenIn)} → {fmt(units(f.amountOut, dec(f.tokenOut)))} {nm(f.tokenOut)}
                    </td>
                    <td className="num">
                      {EXPLORER ? <a href={`${EXPLORER}/tx/${f.tx}`} target="_blank" rel="noreferrer" className="gold">{f.block.toString()}</a> : f.block.toString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Explain anchor="6-why-both-venues-always-agree" points={[
        "Weights vs target: how the wallet's value is split now, at the market prices you type in.",
        "Same quote on both venues: one trade quoted on Uniswap and 1inch in a single call. Δ is the difference in the token's smallest unit.",
        "Rebalancing: when your prices differ from the wallet's, traders profit by moving it back to target, and pay the fee to the wallet.",
        "Venue limits: how much each venue may still sell. Uniswap input waits as claims until someone flushes it into the wallet.",
      ]} />
    </div>
  );
}
