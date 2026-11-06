"use client";

import Link from "next/link";
import { useState } from "react";
import { parseUnits } from "viem";
import { deployment, NETWORK } from "@/lib/config";
import { amt, fmt, quoteBoth, quoteRoute, readBook, units } from "@/lib/mohur";
import { usePoll } from "@/components/useIndex";
import { AnonMark, VenueLogo } from "@/components/VenueMark";
import { TokenIcon } from "@/components/TokenIcon";
import { ProblemSolution } from "@/components/ProblemSolution";

const REPO = "https://github.com/Abhist17/mohur";
// Measured on a Base Sepolia fork by ./scripts/demo.sh and the Foundry tests (used until an index is live on this network)
const MEASURED = { out: "413.769069", loopPct: -0.808, price: 4000 };

const FAQ: [string, string][] = [
  ["What is Unison?", "A way to turn your own wallet into an index (say 40% ETH, 30% BTC, 30% USDC) that Uniswap v4 and 1inch Aqua both trade, from the same coins, at the same price."],
  ["Do my coins leave my wallet?", "No. Your wallet approves one contract, 1inch Aqua, which gives each venue a selling limit. Coins move only when a trade fills, straight from your wallet to the trader."],
  ["Why is the price the same on both venues?", "Both venues call the same pricing function over your real balances: a Uniswap v4 hook on one side, a 1inch SwapVM instruction (opcode 0xd0) on the other. There is nothing to keep in sync."],
  ["Can someone arbitrage me between the venues?", "No. With one price on both venues there is no gap to trade, and any loop through your wallet loses money (−0.8% for a 1 ETH loop across both venues)."],
  ["Does it remove LVR?", "No. When the outside market moves, the traders who rebalance you capture that move; you earn the 0.30% fee. We say so plainly on every screen that matters."],
  ["Is it live?", "It runs on Base Sepolia (testnet) with test tokens that have no value. It is not externally audited; our own review found and fixed one critical bug."],
];

export default function Landing() {
  const d = deployment();
  const live = !!d?.demoHook;
  const [q, setQ] = useState<{ v4: bigint; aqua: bigint }>();
  const [loopPct, setLoopPct] = useState<number>();
  const [price, setPrice] = useState<number>();

  usePoll(
    async () => {
      if (!d?.demoHook) return;
      const [b, both, route] = await Promise.all([
        readBook(d.demoHook, d.demoMaker),
        quoteBoth(d.demoHook, d.tWETH, d.tUSDC, parseUnits("0.1", 18)),
        quoteRoute(d.demoHook, [d.tWETH, d.tUSDC, d.tWBTC, d.tWETH], [0, 1, 0], parseUnits("1", 18)),
      ]);
      const eth = b.tokens.find((t) => t.symbol === "tWETH"), usdc = b.tokens.find((t) => t.symbol === "tUSDC");
      if (eth && usdc) setPrice(((Number(eth.weight) / Number(usdc.weight)) * units(usdc.effectiveBalance, 6)) / units(eth.effectiveBalance, 18));
      setQ({ v4: both.v4Out, aqua: both.aquaOut });
      setLoopPct((units(route.amounts[3], 18) - 1) * 100);
    },
    NETWORK === "local" ? 8000 : 60000,
    [d?.demoHook],
  );

  const v4 = q ? amt(q.v4, 6, 9) : MEASURED.out;
  const aqua = q ? amt(q.aqua, 6, 9) : MEASURED.out;
  const gap = q ? (q.v4 > q.aqua ? q.v4 - q.aqua : q.aqua - q.v4).toString() : "0";
  const loop = (loopPct ?? MEASURED.loopPct).toFixed(2).replace("-", "−");
  const isLive = live && !!q;

  return (
    <div className="lp">
      {/* ---------- hero: one sentence ---------- */}
      <section className="lp-hero wrap">
        <div className="lp-chip">
          <span className="lp-chip-i"><VenueLogo venue={0} size={14} /> Uniswap v4 hook</span>
          <span className="faint">×</span>
          <span className="lp-chip-i"><VenueLogo venue={1} size={14} /> 1inch Aqua</span>
          <span className="faint">×</span>
          <span className="lp-chip-i"><AnonMark size={12} label="Anon-RPC" /></span>
        </div>
        <h1 className="lp-title" data-testid="hero-title">One wallet, traded on every venue at one price.</h1>
        <p className="lp-sub">
          Uniswap and 1inch both trade your index from the same coins, at the same price. No oracle, no split capital, and nobody watching.
        </p>
        <div className="row lp-cta">
          <Link href="/swap" className="btn primary lp-btn" data-testid="launch-app">Launch app</Link>
          <Link href="/demo" className="btn lp-btn" data-testid="landing-demo">Run the demo</Link>
        </div>
        <div className="lp-trust" data-testid="trust-row">
          <span className="lp-trust-label">Proven by</span>
          <a href={`${REPO}/actions/workflows/test.yml`} target="_blank" rel="noreferrer" className="lp-trust-item"><b>59 contract tests</b><span>unit, fuzz, fork</span></a>
          <a href={`${REPO}/tree/main/web/e2e`} target="_blank" rel="noreferrer" className="lp-trust-item"><b>Browser suite</b><span>every screen, real Chrome</span></a>
          <a href={`${REPO}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer" className="lp-trust-item"><b>Own security review</b><span>1 critical found, fixed</span></a>
        </div>

        {/* ---------- the product, live: same trade on both venues ---------- */}
        <div className="lp-stage">
          <div className="lp-float lp-float-l" data-testid="chip-loop">
            <span className="faint">Arbitrage loop</span>
            <b className="bad">{loop}%</b>
          </div>
          <div className="card lp-live" data-testid="live-card">
            <div className="spread lp-live-head">
              <span className="row" style={{ gap: 8 }}>
                <TokenIcon symbol="tWETH" size={22} /> <b>ETH / USDC</b> <span className="muted">{fmt(price ?? MEASURED.price)}</span>
              </span>
              <span className={`lp-status ${isLive ? "on" : ""}`}>{isLive ? "● Live · demo index" : "Measured on a Base Sepolia fork"}</span>
            </div>
            <div className="lp-live-title">Sell 0.1 ETH. Same trade, both venues:</div>
            <div className="lp-venues">
              <div className="lp-venue">
                <span className="row" style={{ gap: 6 }}><VenueLogo venue={0} size={18} /> Uniswap v4</span>
                <b data-testid="live-v4">{v4}</b>
                <span className="faint">USDC</span>
              </div>
              <div className="lp-eq" aria-hidden="true">=</div>
              <div className="lp-venue">
                <span className="row" style={{ gap: 6 }}><VenueLogo venue={1} size={18} /> 1inch Aqua</span>
                <b data-testid="live-aqua">{aqua}</b>
                <span className="faint">USDC</span>
              </div>
            </div>
            <div className="lp-live-foot">
              <div><span className="faint">Difference</span><b className="good" data-testid="live-gap">{gap} wei</b></div>
              <div><span className="faint">Paid from</span><b>the maker&apos;s wallet</b></div>
              <div><span className="faint">Oracle</span><b>none</b></div>
            </div>
          </div>
          <div className="lp-float lp-float-r" data-testid="chip-private">
            <span className="faint">Private reads</span>
            <b className="good">100%</b>
          </div>
        </div>
      </section>

      {/* ---------- one big number ---------- */}
      <section className="lp-big wrap" id="number">
        <div className="lp-big-n" data-testid="big-number">0 wei</div>
        <h2 className="lp-big-t">between Uniswap and 1inch, on every trade</h2>
        <p className="lp-big-s">Both venues ask one price function over one wallet, so there is nothing to keep in sync.</p>
        <div className="lp-stats">
          <div><b>{loop}%</b><span>any arbitrage loop</span></div>
          <div><b>40 / 30 / 30</b><span>restored by traders alone</span></div>
          <div><b>$25</b><span>to change the mix, not $1,991</span></div>
        </div>
      </section>

      {/* ---------- the question, and the answer ---------- */}
      <section className="lp-sec wrap" id="problem">
        <div className="lp-head">
          <div className="eyebrow">The problem</div>
          <h2>Two venues shouldn&apos;t mean two piles</h2>
          <p>To earn fees on Uniswap and 1inch today, you split your coins in two and the prices drift apart. What if one wallet could serve both?</p>
        </div>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <ProblemSolution price={isLive && price ? fmt(price) : "4,000"} live={isLive} />
        </div>
      </section>

      {/* ---------- how it works: three steps ---------- */}
      <section className="lp-sec lp-tinted" id="how">
        <div className="wrap">
          <div className="lp-head">
            <div className="eyebrow">How it works</div>
            <h2>One wallet that both venues trade</h2>
            <p>Unison is a Uniswap v4 hook and a 1inch Aqua instruction that share one price function. It reads only your balances, so there is no oracle to feed and no bot to run.</p>
          </div>
          <div className="grid g3">
            {[
              ["01", "One wallet", "Your coins stay put", "You approve one contract, 1inch Aqua. Each venue gets a selling limit, not your coins.", [["Uniswap venue", "limit, not coins"], ["1inch venue", "limit, not coins"]]],
              ["02", "One price", "Both venues ask the same function", "A Uniswap v4 hook and a 1inch SwapVM opcode call one quote() over your real balances.", [["Uniswap", "v4 hook"], ["1inch", "opcode 0xd0"]]],
              ["03", "Self-rebalancing", "Traders keep you on target", "When prices move, traders buy what is cheap from you until you are back at 40/30/30, and pay you the fee.", [["Rebalancing", "by traders"], ["Fee", "0.30% to you"]]],
            ].map(([n, k, t, body, rows]) => (
              <div key={n as string} className="card lp-step">
                <div className="lp-step-n">{n as string} · {k as string}</div>
                <h3>{t as string}</h3>
                <p>{body as string}</p>
                <div className="lp-step-rows">
                  {(rows as string[][]).map(([a, b]) => (
                    <div key={a} className="spread"><span className="muted">{a}</span><span className="tag live">{b}</span></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", marginTop: 20 }}><Link href="/how" className="accent">The whole idea, step by step →</Link></p>
        </div>
      </section>

      {/* ---------- measured, not promised ---------- */}
      <section className="lp-dark" id="proof">
        <div className="wrap">
          <div className="lp-head">
            <h2>Measured on a fork of the live chain</h2>
            <p>Every number below comes from the contracts running against the real Uniswap v4 PoolManager on a Base Sepolia fork, checked by 59 contract tests and a browser suite that clicks every screen.</p>
            <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
              <Link href="/demo" className="btn lp-btn-light">Run the demo</Link>
              <a href={`${REPO}#tests`} target="_blank" rel="noreferrer" className="btn lp-btn-ghost">Full results in the README ↗</a>
            </div>
          </div>
          <div className="lp-stats lp-stats-4">
            <div><b>0 wei</b><span>price gap between venues</span></div>
            <div><b>{loop}%</b><span>a 1 ETH loop across both</span></div>
            <div><b>40.01%</b><span>ETH weight back on target after a +25% move</span></div>
            <div><b>$25</b><span>to re-weight $100k, vs $1,991</span></div>
          </div>
          <p className="lp-foot-note">Fork runs and Foundry tests, documented in the README. Not live trading volume.</p>
        </div>
      </section>

      {/* ---------- change the mix ---------- */}
      <section className="lp-sec wrap" id="reweight">
        <div className="lp-head">
          <div className="eyebrow">Changing your mix</div>
          <h2>Less for arbitrageurs, more for you</h2>
          <p>Moving a $100k index from 40/30/30 to 50/25/25: switch instantly and arbitrageurs take the whole gap; glide there and traders walk you over in small trades that pay you the fee.</p>
        </div>
        <div className="card lp-bars" data-testid="reweight-bars">
          <div className="spread"><b>What it costs to change the mix</b><span className="faint mono" style={{ fontSize: 12 }}>$100k · 40/30/30 → 50/25/25 · Reweight.t.sol</span></div>
          {[["Instant switch", 1991, false], ["Unison gradual glide (50 steps)", 25, true]].map(([label, v, us]) => (
            <div key={label as string} className="lp-bar-row">
              <div className="spread"><span className={us ? "" : "muted"} style={{ fontWeight: us ? 600 : 400 }}>{label as string}</span><b className={us ? "accent" : ""}>${(v as number).toLocaleString()}</b></div>
              <div className="lp-bar"><span style={{ width: `${Math.max(1.5, ((v as number) / 1991) * 100)}%`, background: us ? "var(--accent-fill)" : "var(--line-2)" }} /></div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- security ---------- */}
      <section className="lp-sec lp-tinted" id="security">
        <div className="wrap">
          <div className="lp-head">
            <div className="eyebrow">Security</div>
            <h2>We attacked it ourselves</h2>
            <p>Testnet only and not externally audited. Here is what we checked, and what we fixed.</p>
          </div>
          <div className="grid g3">
            <div className="card lp-step">
              <div className="lp-step-n">Found and fixed</div>
              <h3>A critical cross-venue bug</h3>
              <p>A trade nested inside a 1inch fill could price on stale balances; the proof of concept took $752. A fail-closed fill lock now blocks it.</p>
              <a className="accent" href={`${REPO}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer">Read the review ↗</a>
            </div>
            <div className="card lp-step">
              <div className="lp-step-n">By design</div>
              <h3>One approval, to Aqua</h3>
              <p>No allowance to the hook, the router or the PoolManager. Each venue can only sell up to the limit you give it.</p>
              <Link className="accent" href="/my">Set your limits →</Link>
            </div>
            <div className="card lp-step">
              <div className="lp-step-n">Private</div>
              <h3>Nobody sees you watching</h3>
              <p>Every chain read goes through the Ethereum Foundation&apos;s Anon-RPC, with a separate key per maker, pair and trader.</p>
              <Link className="accent" href="/privacy">See every read →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- build on it ---------- */}
      <section className="lp-sec wrap" id="build">
        <div className="lp-build card">
          <div>
            <div className="eyebrow">For developers</div>
            <h2 style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>Use Unison in your own product</h2>
            <p className="muted">Clone it, run the whole thing locally in one command, then launch an index, quote both venues, or route trades from your own app.</p>
            <div className="row" style={{ marginTop: 14 }}>
              <Link href="/docs" className="btn primary" data-testid="docs-cta">Read the docs</Link>
              <a href={REPO} target="_blank" rel="noreferrer" className="btn">GitHub ↗</a>
            </div>
          </div>
          <pre className="lp-code"><code>{`git clone --recursive ${REPO}
cd mohur
(cd contracts && npm ci) && (cd web && npm ci)
./scripts/demo.sh`}</code></pre>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="lp-sec wrap" id="faq" style={{ maxWidth: 820 }}>
        <div className="lp-head">
          <div className="eyebrow">FAQ</div>
          <h2>Questions people ask</h2>
        </div>
        {FAQ.map(([qq, a]) => (
          <details key={qq} className="card more lp-faq">
            <summary><h3>{qq}</h3></summary>
            <p className="muted" style={{ margin: 0 }}>{a}</p>
          </details>
        ))}
      </section>

      <section className="lp-sec wrap" style={{ textAlign: "center", paddingTop: 0 }}>
        <h2>Try it in a minute.</h2>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <Link href="/swap" className="btn primary lp-btn">Launch app</Link>
          <Link href="/demo" className="btn lp-btn">Run the demo</Link>
        </div>
      </section>
    </div>
  );
}
