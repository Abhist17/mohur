"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseUnits } from "viem";
import { StacksScene, type SceneState } from "@/components/StacksScene";
import { deployment, NETWORK } from "@/lib/config";
import { fmt, quoteRoute, readBook, sim, units, type Book } from "@/lib/mohur";
import { usePoll } from "@/components/useIndex";
import { VenueMark } from "@/components/VenueMark";

const BASE = { eth: 10, btc: 0.3, usdc: 30000 }; // $100k at $4,000 / $100,000
const W = [0.4, 0.3, 0.3];
type Stage = "hero" | "problem" | "mohur" | "oneprice" | "market" | "loops" | "private";

export default function Landing() {
  const d = deployment();
  const [stage, setStage] = useState<Stage>("hero");
  const [book, setBook] = useState<Book>();
  const [loop, setLoop] = useState<{ out: number; bps: number }>();
  const [k, setK] = useState(1.6); // ETH price multiple for "drag the market"
  const [pour, setPour] = useState(false);
  const [tradeTick, setTradeTick] = useState(0);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // live demo index (falls back to the example book while loading)
  usePoll(
    async () => {
      if (!d?.demoHook) return;
      const b = await readBook(d.demoHook, d.demoMaker);
      setBook(b);
      const p = [d.tWETH, d.tUSDC, d.tWBTC, d.tWETH];
      const q = await quoteRoute(d.demoHook, p, [0, 1, 0], parseUnits("0.1", 18));
      const out = units(q.amounts[3], 18);
      setLoop({ out, bps: ((0.1 - out) / 0.1) * 10_000 });
    },
    NETWORK === "local" ? 6000 : 30000,
    [d?.demoHook],
  );

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setStage(e.target.getAttribute("data-stage") as Stage)),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    Object.values(refs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (stage !== "oneprice") return;
    const id = setInterval(() => setTradeTick((t) => t + 1), 1400);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    setPour(true);
    const id = setTimeout(() => setPour(false), 1100);
    return () => clearTimeout(id);
  }, [k]);

  // live balances, if any
  const live = book && book.tokens.length === 3;
  const bal = live
    ? { eth: units(book!.tokens[0].effectiveBalance, 18), btc: units(book!.tokens[1].effectiveBalance, 8), usdc: units(book!.tokens[2].effectiveBalance, 6) }
    : BASE;
  const ethPrice = live && book!.pairs.length ? sim.spot(bal.eth, W[0], bal.usdc, W[2]) : 4000;

  const scene: SceneState = useMemo(() => {
    const coins = (e: number, b: number, u: number, pe = 4000, pb = 100000) => [(e * pe) / 1000, (b * pb) / 1000, u / 1000] as [number, number, number];
    if (stage === "problem") return { counts: coins(BASE.eth, BASE.btc, BASE.usdc), layout: "split", splitShare: [0.62, 0.41, 0.5], links: false };
    if (stage === "oneprice") {
      // simulated trades: alternate ETH sells and buys, moving coins between stacks
      const s = tradeTick % 4;
      const e = BASE.eth + (s === 1 ? 1 : s === 3 ? -0.8 : 0);
      const u = BASE.usdc * Math.pow(BASE.eth / e, W[0] / W[2]);
      return { counts: coins(e, BASE.btc, u), layout: "merged", links: true };
    }
    if (stage === "market") {
      const [e, b, u] = pour ? [BASE.eth, BASE.btc, BASE.usdc] : sim.rebalanced([BASE.eth, BASE.btc, BASE.usdc], W, 0, k);
      return { counts: coins(e, b, u, 4000 * k), layout: "merged", links: true };
    }
    return { counts: coins(bal.eth, bal.btc, bal.usdc, ethPrice), layout: "merged", links: stage !== "hero" };
  }, [stage, tradeTick, k, pour, bal.eth, bal.btc, bal.usdc, ethPrice]);

  // price tags on the two counters
  const tradeEth = stage === "oneprice" ? (() => {
    const s = tradeTick % 4;
    const e = BASE.eth + (s === 1 ? 1 : s === 3 ? -0.8 : 0);
    const u = BASE.usdc * Math.pow(BASE.eth / e, W[0] / W[2]);
    return sim.spot(e, W[0], u, W[2]);
  })() : undefined;
  const tags =
    stage === "problem"
      ? { uni: 3962.4, inch: 4051.8, sim: true }
      : stage === "market"
        ? { uni: 4000 * k, inch: 4000 * k, sim: true }
        : tradeEth
          ? { uni: tradeEth, inch: tradeEth, sim: true }
          : { uni: ethPrice, inch: ethPrice, sim: !live };

  const holdV = 40000 * k + 60000;
  const mohurV = 100000 * Math.pow(k, 0.4);

  const sec = (s: Stage) => ({ ref: (el: HTMLElement | null) => { refs.current[s] = el; }, "data-stage": s });

  return (
    <div>
      <style>{`
        .story { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 32px; }
        .story-text section { min-height: 88vh; display: flex; flex-direction: column; justify-content: center; padding: 40px 0; }
        .story-text section p { color: var(--muted); font-size: 19px; max-width: 440px; margin-top: 12px; }
        .stage { position: sticky; top: 60px; height: calc(100vh - 60px); }
        .tagbox { position: absolute; top: 18%; padding: 10px 14px; border-radius: 12px; background: color-mix(in srgb, var(--panel) 88%, transparent); box-shadow: var(--shadow); border: 1px solid var(--line-2); font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
        .hero { min-height: calc(92vh - 60px); display: flex; flex-direction: column; justify-content: center; position: relative; }
        .hero p { font-size: 20px; color: var(--muted); max-width: 560px; margin-top: 18px; }
        @media (max-width: 860px) {
          .story { grid-template-columns: 1fr; }
          .stage { position: sticky; top: 60px; height: 46vh; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); }
          .story-text { order: 2; }
          .story-text section { min-height: 70vh; }
        }
      `}</style>

      <div className="wrap">
        <section className="hero">
          <div className="eyebrow">ETHGlobal · Uniswap v4 × 1inch Aqua × Anon-RPC</div>
          <h1 style={{ marginTop: 16 }}>
            One wallet, one price,
            <br />
            <span className="gold">every venue</span>, nobody watching.
          </h1>
          <p>Your wallet becomes a 40/30/30 index. Uniswap and 1inch both trade it, at one price, with no oracle.</p>
          <div className="row" style={{ marginTop: 20 }}>
            <Link href="/swap" className="btn primary">Start trading</Link>
            <Link href="/demo" className="btn" data-testid="landing-demo">Run the demo</Link>
            <Link href="/create" className="btn">Launch an index</Link>
            <a href="#story" className="btn">How it works ↓</a>
          </div>
        </section>
      </div>

      <div className="wrap story" id="story">
        <div className="story-text">
          <section {...sec("hero")}>
            <div className="eyebrow">One stockroom, two stalls</div>
            <h2>Your wallet is the stockroom.</h2>
            <p>Uniswap and 1inch are two stalls selling from it. One shelf, so one price.</p>
            {live ? <span className="tag live">live balances from the demo index</span> : <span className="tag sim">example book</span>}
          </section>
          <section {...sec("problem")}>
            <div className="eyebrow">1 · The problem</div>
            <h2>Two venues, two piles, two prices.</h2>
            <p>Today you split your coins across venues. Each pile drifts to its own price.</p>
          </section>
          <section {...sec("mohur")}>
            <div className="eyebrow">2 · Mohur</div>
            <h2>One pile feeding both counters.</h2>
            <p>A v4 hook and a 1inch opcode read the same balances. You approve only Aqua.</p>
          </section>
          <section {...sec("oneprice")}>
            <div className="eyebrow">3 · One price</div>
            <h2>A trade at either stall moves both tags.</h2>
            <p>Fill on Uniswap, and 1inch&apos;s next quote already knows. <b className="mono">0 units</b> apart in tests.</p>
            <span className="tag sim">simulated trades</span>
          </section>
          <section {...sec("market")}>
            <div className="eyebrow">4 · Drag the market</div>
            <h2>It rebalances itself.</h2>
            <p>Drag ETH&apos;s price. Traders buy what&apos;s cheap until you&apos;re back on target, and you earn the fee.</p>
            <label className="stack" style={{ gap: 6, maxWidth: 470 }}>
              <span className="mono">ETH ${fmt(4000 * k)}</span>
              <input type="range" min={0.5} max={2} step={0.01} value={k} onChange={(e) => setK(Number(e.target.value))} />
            </label>
            <div className="row" style={{ gap: 20, fontSize: 14 }}>
              <span className="muted">Hold <b className="mono" style={{ color: "var(--text)" }}>${fmt(holdV)}</b></span>
              <span className="muted">Mohur <b className="mono" style={{ color: "var(--text)" }}>${fmt(mohurV)}</b></span>
              {holdV > mohurV + 1 && <span className="muted" title="This gap is LVR: Mohur does not remove it, the fee pays you for it">LVR <b className="mono bad">−${fmt(holdV - mohurV)}</b></span>}
            </div>
            <span className="tag sim">computed with the contracts&apos; formula</span>
          </section>
          <section {...sec("loops")}>
            <div className="eyebrow">5 · Loops lose</div>
            <h2>It can&apos;t be gamed.</h2>
            <p>Any loop through your wallet, on one venue or both, comes back short.</p>
            {loop ? (
              <div className="card" style={{ maxWidth: 470 }}>
                <div className="faint" style={{ fontSize: 12 }}>Live quote · ETH → USDC → BTC → ETH across both venues</div>
                <div className="spread" style={{ marginTop: 8 }}>
                  <span className="mono">0.1 → {loop.out.toFixed(5)} ETH</span>
                  <span className="mono bad" style={{ fontSize: 24 }}>−{loop.bps.toFixed(1)} bps</span>
                </div>
              </div>
            ) : d?.demoHook ? (
              <span className="tag">loading live quote…</span>
            ) : (
              <div className="card" style={{ maxWidth: 470 }} data-testid="loop-measured">
                <div className="faint" style={{ fontSize: 12 }}>Measured in the contract tests (CrossVenue.t.sol) · not deployed on this network yet</div>
                <div className="spread" style={{ marginTop: 8 }}>
                  <span className="mono">0.1 ETH → USDC → BTC → ETH</span>
                  <span className="mono bad" style={{ fontSize: 24 }}>−88 bps</span>
                </div>
              </div>
            )}
            <Link href="/arbitrage" className="gold" style={{ marginTop: 12 }}>Try to beat it →</Link>
          </section>
          <section {...sec("private")}>
            <div className="eyebrow">6 · Private</div>
            <h2>Nobody watching.</h2>
            <p>Every read goes through EF&apos;s Anon-RPC, so no RPC provider learns what you watch.</p>
            <Link href="/privacy" className="gold">Watch every read →</Link>
          </section>
        </div>

        <div className="stage">
          <StacksScene state={scene} />
          <div className="tagbox" style={{ left: 8 }}>
            <div style={{ color: "var(--uni)" }}><VenueMark venue={0} size={16} /></div>
            <div>1 ETH = {fmt(tags.uni)} USDC</div>
          </div>
          <div className="tagbox" style={{ right: 8, textAlign: "right" }}>
            <div style={{ color: "var(--inch)" }}><VenueMark venue={1} size={16} /></div>
            <div>1 ETH = {fmt(tags.inch)} USDC</div>
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center" }} className="faint mono">
            {stage === "problem" ? "two piles · prices drift apart" : "one wallet · ETH · BTC · USDC"}
            {tags.sim ? " · simulated" : " · live"}
          </div>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 80 }}>
        <div className="eyebrow">Proven in tests</div>
        <h2 style={{ margin: "12px 0 24px" }}>The numbers.</h2>
        <div className="grid g4">
          {[
            ["0 units", "price gap between venues"],
            ["−88 bps", "a loop across both venues"],
            ["40 / 30 / 30", "restored by traders alone"],
            ["$25", "to re-weight $100k (vs $1,991)"],
          ].map(([n, t]) => (
            <div key={n} className="card">
              <div className="serif gold" style={{ fontSize: 40 }}>{n}</div>
              <div className="muted" style={{ fontSize: 14 }}>{t}</div>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>Foundry tests, incl. forks of Uniswap v4 on Base Sepolia.</p>

        <hr className="sep" />
        <div className="grid g2">
          <div className="card">
            <div className="eyebrow" style={{ color: "var(--uni)" }}><VenueMark venue={0} size={16} /></div>
            <h3 style={{ marginTop: 8 }}>MohurHook</h3>
            <p className="muted" style={{ fontSize: 15 }}>Custom-curve hook. Prices from your wallet, pays out through Aqua.</p>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ color: "var(--inch)" }}><VenueMark venue={1} size={16} /></div>
            <h3 style={{ marginTop: 8 }}>PortfolioPrice · opcode 0xd0</h3>
            <p className="muted" style={{ fontSize: 15 }}>Custom SwapVM instruction. Same price as the hook, by construction.</p>
          </div>
        </div>

        <hr className="sep" />
        <h2 style={{ marginBottom: 20 }}>Pick a way in</h2>
        <div className="grid g4" style={{ marginBottom: 40 }}>
          {[
            ["/swap", "Swap", "Trade on either venue"],
            ["/create", "Launch", "Your own index"],
            ["/arbitrage", "Arbitrage me", "Try to beat it"],
            ["/privacy", "Privacy", "See every read"],
          ].map(([href, t, s]) => (
            <Link key={href} href={href} className="card" style={{ display: "block" }}>
              <h3>{t} →</h3>
              <div className="muted" style={{ fontSize: 14 }}>{s}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
