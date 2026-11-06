"use client";

import Link from "next/link";
import { useState } from "react";
import { parseUnits } from "viem";
import { deployment, NETWORK } from "@/lib/config";
import { fmt, quoteBoth, quoteRoute, readBook, TOKEN_STYLE, units, type Book } from "@/lib/unison";
import { usePoll } from "@/components/useIndex";
import { VenueLogo } from "@/components/VenueMark";
import { TokenIcon } from "@/components/TokenIcon";
import { ProblemSolution } from "@/components/ProblemSolution";
import { Concept } from "@/components/Concept";
import { TradeFlow } from "@/components/TradeFlow";

const REPO = "https://github.com/Abhist17/unison";
const T = (f: string, line?: number) => `${REPO}/blob/main/contracts/test/${f}${line ? `#L${line}` : ""}`;

// Shown until an index is live on this network: measured by ./scripts/demo.sh on a Base Sepolia fork
const MEASURED = { eth: 10, btc: 0.3, usdc: 30000, out: 413.769069, loopPct: -0.808 };

/** The real output of ./scripts/demo.sh on a Base Sepolia fork (6 Nov 2026), shortened. */
const RECEIPT = `$ ./scripts/demo.sh
  DeployUnison ok · LaunchIndex ok · DemoTrades ok

Same trade, both venues
  sell 0.1 ETH    Uniswap 413.769069 USDC   1inch 413.769069 USDC   difference 0 wei
  sell 300 USDC   Uniswap 0.002736 BTC      1inch 0.002736 BTC      difference 0 wei
  sell 0.001 BTC  Uniswap 0.025639 ETH      1inch 0.025639 ETH      difference 0 wei

Arbitrage check: ETH -> USDC -> BTC -> ETH across both venues
  1 ETH in -> 0.991924 ETH out  (-0.808%)

Real fills on chain
  Uniswap v4 fills: 2    1inch Aqua fills: 2`;

export default function Landing() {
  const d = deployment();
  const [book, setBook] = useState<Book>();
  const [q, setQ] = useState<{ v4: bigint; aqua: bigint }>();
  const [loopPct, setLoopPct] = useState<number>();

  usePoll(
    async () => {
      if (!d?.demoHook) return;
      const [b, both, route] = await Promise.all([
        readBook(d.demoHook, d.demoMaker),
        quoteBoth(d.demoHook, d.tWETH, d.tUSDC, parseUnits("0.1", 18)),
        quoteRoute(d.demoHook, [d.tWETH, d.tUSDC, d.tWBTC, d.tWETH], [0, 1, 0], parseUnits("1", 18)),
      ]);
      setBook(b);
      setQ({ v4: both.v4Out, aqua: both.aquaOut });
      setLoopPct((units(route.amounts[3], 18) - 1) * 100);
    },
    NETWORK === "local" ? 8000 : 60000,
    [d?.demoHook],
  );

  const live = !!book && !!q;
  const bal = (sym: string, fallback: number) => {
    const t = book?.tokens.find((x) => x.symbol === sym);
    return t ? units(t.effectiveBalance, t.decimals) : fallback;
  };
  const wallet = [
    { sym: "tWETH", w: 40, amt: bal("tWETH", MEASURED.eth) },
    { sym: "tWBTC", w: 30, amt: bal("tWBTC", MEASURED.btc) },
    { sym: "tUSDC", w: 30, amt: bal("tUSDC", MEASURED.usdc) },
  ];
  const uni = q ? units(q.v4, 6) : MEASURED.out;
  const inch = q ? units(q.aqua, 6) : MEASURED.out;
  const gap = q ? (q.v4 > q.aqua ? q.v4 - q.aqua : q.aqua - q.v4).toString() : "0";
  const loop = (loopPct ?? MEASURED.loopPct).toFixed(2).replace("-", "−");

  return (
    <div className="u">
      {/* ---------- hero: the hook, and the product beside it ---------- */}
      <section className="u-hero wrap">
        <div className="u-hero-text">
          <div className="u-kicker">For market makers and index holders</div>
          <h1 className="u-title" data-testid="hero-title">Stop splitting your coins across exchanges.</h1>
          <p className="u-lede">
            Unison lets Uniswap and 1inch trade <b>one wallet</b> at <b>one price</b>. Your coins stay put, both venues quote the same number, and nobody sees you watching.
          </p>
          <div className="u-actions">
            <Link href="/swap" className="btn primary u-btn" data-testid="launch-app">Open the app</Link>
            <Link href="/demo" className="u-link" data-testid="landing-demo">Watch it work in 6 steps →</Link>
          </div>
          <ul className="u-facts" data-testid="trust-row">
            <li><span className="u-tick">✓</span> 0 wei apart on both venues</li>
            <li><span className="u-tick">✓</span> Arbitrage loops lose money</li>
            <li><span className="u-tick">✓</span> 59 contract tests, all green</li>
          </ul>
        </div>

        {/* the price board: one wallet, two venues, one number */}
        <div className="u-board" data-testid="live-card">
          <div className="u-board-head">
            <span>Price board</span>
            <span className={live ? "good" : "faint"}>{live ? "● live · demo index" : "measured on a Base Sepolia fork"}</span>
          </div>
          <div className="u-board-sec">
            <div className="u-board-label">One wallet · target 40 / 30 / 30</div>
            {wallet.map((x) => (
              <div key={x.sym} className="u-hold">
                <span className="row" style={{ gap: 8 }}><TokenIcon symbol={x.sym} size={20} /> {TOKEN_STYLE[x.sym].name}</span>
                <span className="u-hold-bar"><span style={{ width: `${x.w * 2}%`, background: TOKEN_STYLE[x.sym].color }} /></span>
                <span className="mono">{fmt(x.amt)}</span>
              </div>
            ))}
          </div>
          <div className="u-board-sec">
            <div className="u-board-label">Two venues · sell 0.1 ETH, you receive (USDC)</div>
            <div className="u-quote"><span className="row" style={{ gap: 8 }}><VenueLogo venue={0} size={18} /> Uniswap v4</span><b data-testid="live-v4">{fmt(uni, 8)}</b></div>
            <div className="u-quote"><span className="row" style={{ gap: 8 }}><VenueLogo venue={1} size={18} /> 1inch Aqua</span><b data-testid="live-aqua">{fmt(inch, 8)}</b></div>
          </div>
          <div className="u-board-foot">
            <span>Difference</span>
            <b className="good" data-testid="live-gap">{gap} wei</b>
          </div>
        </div>
      </section>

      {/* ---------- the idea, told as a shop ---------- */}
      <section className="u-sec wrap" id="idea">
        <div className="u-sec-head">
          <span className="u-num">01</span>
          <div>
            <h2>The idea, in a shop</h2>
            <p>Raju keeps mangoes, rice and cash in one stockroom and opens two stalls in two markets. That&apos;s Unison.</p>
          </div>
        </div>
        <div className="u-row">
          <div className="u-row-text">
            <h3>Today, two stalls means two stockrooms</h3>
            <p>To sell in two markets, you split your stock. Each pile gets its own price, the prices drift, and arbitrageurs live off the gap.</p>
          </div>
          <div className="u-row-pic"><ProblemSolution price={live ? fmt(uni * 10) : "4,000"} live={live} /></div>
        </div>
        <div className="u-row u-row-flip">
          <div className="u-row-text">
            <h3>With Unison, both stalls sell from one shelf</h3>
            <p>Your wallet is the stockroom. Uniswap and 1inch are the stalls. A sale at either one changes the shelf, so both price tags move together. Nothing to sync.</p>
            <Link href="/book" className="accent">See the live book →</Link>
          </div>
          <div className="u-row-pic"><Concept highlight="wallet" caption={<><b>One shelf, one price.</b> Both venues read the same balances.</>} /></div>
        </div>
        <div className="u-row u-row-wide">
          <div className="u-row-text">
            <h3>What actually happens on a trade</h3>
            <p>A Uniswap v4 hook and a 1inch SwapVM instruction ask the same price function. Coins move straight from your wallet through 1inch Aqua, your only approval.</p>
            <Link href="/how" className="accent">The whole idea, step by step →</Link>
          </div>
          <div className="u-row-pic"><TradeFlow /></div>
        </div>
      </section>

      {/* ---------- receipts: run it yourself ---------- */}
      <section className="u-sec wrap" id="proof">
        <div className="u-sec-head">
          <span className="u-num">02</span>
          <div>
            <h2>Don&apos;t trust us. Run it.</h2>
            <p>One command forks Base Sepolia with the real Uniswap v4 contracts, deploys Unison, trades on both venues and prints this:</p>
          </div>
        </div>
        <div className="u-receipt-wrap">
          <pre className="u-receipt" data-testid="receipt"><code>{RECEIPT}</code></pre>
          <div className="u-receipt-side">
            <div className="u-receipt-item"><span className="faint">Same trade, both venues</span><b>0 wei apart</b></div>
            <div className="u-receipt-item"><span className="faint">Arbitrage loop{loopPct !== undefined ? " (live)" : ""}</span><b className="bad">{loop}%</b></div>
            <div className="u-receipt-item"><span className="faint">Every check</span><b>59 tests · 36 on-chain · every screen</b></div>
            <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
              <Link href="/docs#quickstart" className="btn small">Run it yourself</Link>
              <Link href="/demo" className="btn small">Or in your browser</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- what you get, each with its proof ---------- */}
      <section className="u-sec wrap" id="get">
        <div className="u-sec-head">
          <span className="u-num">03</span>
          <div>
            <h2>What you get</h2>
            <p>Every line links to the test that proves it.</p>
          </div>
        </div>
        <div className="u-checks">
          {[
            ["One price on both venues", "The same trade returns the same amount on Uniswap and 1inch, to the wei.", T("CrossVenue.t.sol", 15)],
            ["Arbitrage loops lose", `Any loop through your wallet comes back short (${loop}% for 1 ETH across both venues).`, T("CrossVenue.t.sol", 57)],
            ["It rebalances itself", "When ETH moves 25%, traders alone bring you back to 40.01 / 29.99 / 29.99, and pay you the fee.", T("CrossVenue.t.sol")],
            ["Change your mix cheaply", "Glide from 40/30/30 to 50/25/25 for $25 instead of $1,991 on $100k.", T("Reweight.t.sol")],
            ["One approval, to Aqua", "No allowance to the hook, the router or the PoolManager. Each venue sells only up to your limit.", T("CrossVenue.t.sol", 125)],
            ["Nobody sees you watching", "Every chain read goes through the Ethereum Foundation's Anon-RPC, one key per maker, pair and trader.", `${REPO}/blob/main/docs/anon-rpc.md`],
          ].map(([t, body, href]) => (
            <a key={t} href={href} target="_blank" rel="noreferrer" className="u-check">
              <span className="u-tick big">✓</span>
              <span><b>{t}</b><span className="muted">{body}</span><span className="u-proof">proof ↗</span></span>
            </a>
          ))}
        </div>
      </section>

      {/* ---------- honest: what we checked, what it doesn't do ---------- */}
      <section className="u-sec wrap" id="security">
        <div className="u-sec-head">
          <span className="u-num">04</span>
          <div>
            <h2>Honest about it</h2>
            <p>Testnet only, not externally audited. Here is what we checked, and what Unison does not do.</p>
          </div>
        </div>
        <div className="grid g2">
          <div className="card u-list">
            <h3>What we checked</h3>
            <ul>
              <li>Our own review found a critical cross-venue bug (a $752 proof of concept). A fail-closed fill lock fixes it.</li>
              <li>Fuzzed invariants: same price on both venues, claims always backed, loops always lose.</li>
              <li>Fork tests against the real Uniswap v4 PoolManager, V4Quoter and Universal Router on Base Sepolia.</li>
            </ul>
            <a className="accent" href={`${REPO}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer">Read the review ↗</a>
          </div>
          <div className="card u-list">
            <h3>What it doesn&apos;t do</h3>
            <ul>
              <li>It doesn&apos;t remove LVR: when markets move, the traders who rebalance you capture the move; you earn the fee.</li>
              <li>One trade moves at most 30% of a balance; each venue sells only up to its limit.</li>
              <li>Use a dedicated wallet: prices read its live balances.</li>
            </ul>
            <Link className="accent" href="/how">All the limits →</Link>
          </div>
        </div>
      </section>

      {/* ---------- developers ---------- */}
      <section className="u-sec wrap" id="build">
        <div className="u-dev">
          <div>
            <h2>Build on it</h2>
            <p className="muted">Clone it and run everything locally in one command. Then launch an index, quote both venues, or route trades from your own app.</p>
            <div className="row" style={{ marginTop: 14 }}>
              <Link href="/docs" className="btn primary" data-testid="docs-cta">Read the docs</Link>
              <a href={REPO} target="_blank" rel="noreferrer" className="btn">GitHub ↗</a>
            </div>
          </div>
          <pre className="u-receipt"><code>{`git clone --recursive ${REPO}
cd unison
(cd contracts && npm ci) && (cd web && npm ci)
./scripts/demo.sh`}</code></pre>
        </div>
      </section>

      {/* ---------- FAQ, open ---------- */}
      <section className="u-sec wrap" id="faq">
        <div className="u-sec-head">
          <span className="u-num">05</span>
          <div><h2>Questions</h2></div>
        </div>
        <div className="u-faq">
          {[
            ["Do my coins leave my wallet?", "No. You approve one contract, 1inch Aqua, which gives each venue a selling limit. Coins move only when a trade fills."],
            ["Why is the price the same on both venues?", "Both call one pricing function over your real balances: a Uniswap v4 hook and a 1inch SwapVM instruction (opcode 0xd0)."],
            ["Can someone arbitrage me between the venues?", "No. There is no gap between them, and any loop through your wallet loses money."],
            ["Is there an oracle or a bot?", "No. Prices come only from your balances, and traders do the rebalancing."],
            ["Is it live?", "On Base Sepolia (testnet) with test tokens that have no value."],
            ["Why the name?", "In music, unison means every voice on the same note at the same time: both venues, one price, same moment."],
          ].map(([qq, a]) => (
            <div key={qq} className="u-qa"><b>{qq}</b><p className="muted">{a}</p></div>
          ))}
        </div>
      </section>

      <section className="u-end wrap">
        <h2>One wallet. Every venue. One price.</h2>
        <div className="u-actions" style={{ justifyContent: "center" }}>
          <Link href="/swap" className="btn primary u-btn">Open the app</Link>
          <Link href="/demo" className="u-link">Watch it work →</Link>
        </div>
      </section>
    </div>
  );
}
