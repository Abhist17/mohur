"use client";

import Link from "next/link";
import { useState } from "react";
import { NETWORK } from "@/lib/config";
import { fmt, readFills, readIndexes, TOKEN_STYLE, units, type IndexCard } from "@/lib/tenbin";
import { Sparkline } from "@/components/Sparkline";
import { useWallet } from "@/lib/wallet";
import { NotDeployed } from "@/components/NotDeployed";
import { TokenIcon } from "@/components/TokenIcon";
import { VenueMark } from "@/components/VenueMark";
import { usePoll, useIndex } from "@/components/useIndex";
import { Explain } from "@/components/Explain";

// reference prices for sizing cards only (Tenbin itself never uses an oracle)
const REF: Record<string, number> = { tWETH: 4000, tWBTC: 100000, tUSDC: 1 };

export default function Explore() {
  const { deployed } = useIndex();
  const w = useWallet();
  const [cards, setCards] = useState<IndexCard[]>();
  const [err, setErr] = useState<string>();

  // per index: real fills -> count, fees, and the ETH/USDC price path for a sparkline
  const [stats, setStats] = useState<Record<string, { fills: number; fees: number; path: number[] }>>({});

  usePoll(
    async () => {
      try {
        const cs = await readIndexes();
        setCards(cs);
        setErr(undefined);
        const entries = await Promise.all(
          cs.filter((c) => c.book).map(async (c) => {
            const b = c.book!;
            const fills = await readFills(c.hook, c.maker).catch(() => []);
            const tok = (a: string) => b.tokens.find((t) => t.token.toLowerCase() === a.toLowerCase());
            const fee = Number(b.fee) / 1e18;
            let fees = 0;
            const path: number[] = [];
            for (const f of [...fills].reverse()) {
              const ti = tok(f.tokenIn), to = tok(f.tokenOut);
              if (!ti || !to) continue;
              fees += units(f.amountIn, ti.decimals) * fee * (REF[ti.symbol] ?? 0);
              if (ti.symbol === "tWETH" && to.symbol === "tUSDC") path.push(units(f.amountOut, 6) / units(f.amountIn, 18));
              if (ti.symbol === "tUSDC" && to.symbol === "tWETH") path.push(units(f.amountIn, 6) / units(f.amountOut, 18));
            }
            return [c.hook, { fills: fills.length, fees, path }] as const;
          }),
        );
        setStats(Object.fromEntries(entries));
      } catch (e) {
        setErr(String((e as Error).message).slice(0, 160));
      }
    },
    NETWORK === "local" ? 10000 : 60000,
    [],
  );

  if (!deployed) return <NotDeployed />;

  return (
    <div className="wrap page">
      <div className="page-head">
        <div className="eyebrow">Explore</div>
        <h2>Every Tenbin index</h2>
        <p>Each one is somebody&apos;s wallet, quoted on both venues at one price. Pick one to trade against.</p>
      </div>
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      {!cards && (
        <div className="grid g3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card stack">
              <span className="skel" style={{ width: "50%" }} />
              <span className="skel" style={{ height: 10 }} />
              <span className="skel" style={{ width: "70%" }} />
            </div>
          ))}
        </div>
      )}
      {cards && cards.length === 0 && (
        <div className="card">
          No indexes yet. <Link href="/create" className="accent">Launch the first one →</Link>
        </div>
      )}
      <div className="grid g3">
        {cards?.map((c) => {
          const b = c.book;
          const value = b ? b.tokens.reduce((a, t) => a + units(t.effectiveBalance, t.decimals) * (REF[t.symbol] ?? 0), 0) : 0;
          const live = b ? b.tokens.some((t) => t.v4Limit > 0n) || b.tokens.some((t) => t.aquaLimit > 0n) : false;
          const mine = !!w.account && c.maker.toLowerCase() === w.account.toLowerCase();
          return (
            <div key={c.hook} className="card stack" style={{ gap: 12 }}>
              <div className="spread">
                <span className="addr faint">{c.maker.slice(0, 6)}…{c.maker.slice(-4)}{mine && <span className="accent"> · you</span>}</span>
                <span className={`tag ${live ? "live" : "sim"}`}>{!b ? "setting up" : live ? "live" : "paused"}</span>
              </div>
              {b ? (
                <>
                  <div className="serif" style={{ fontSize: 34, lineHeight: 1 }}>${fmt(value)}</div>
                  <div className="bar" style={{ height: 10 }}>
                    {b.tokens.map((t) => (
                      <span key={t.token} style={{ width: `${Number(t.weight) / 1e16}%`, background: TOKEN_STYLE[t.symbol]?.color }} />
                    ))}
                  </div>
                  <div className="row" style={{ gap: 14, fontSize: 13.5 }}>
                    {b.tokens.map((t) => (
                      <span key={t.token} className="row" style={{ gap: 6 }}>
                        <TokenIcon symbol={t.symbol} size={16} />
                        {(Number(t.weight) / 1e16).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                  <div className="row faint" style={{ gap: 12, fontSize: 12.5 }}>
                    <VenueMark venue={0} size={14} short /> <VenueMark venue={1} size={14} short />
                    <span>fee {(Number(b.fee) / 1e16).toFixed(2)}%</span>
                  </div>
                  <div className="spread explore-stats" data-testid="explore-stats">
                    <span><b className="mono">{stats[c.hook]?.fills ?? "…"}</b> <span className="faint">fills</span></span>
                    <span><b className="mono">{stats[c.hook] ? "$" + fmt(stats[c.hook].fees) : "…"}</b> <span className="faint">fees</span></span>
                    <span title="ETH price of each real ETH/USDC fill, oldest to newest">
                      <Sparkline points={stats[c.hook]?.path ?? []} label="ETH price of each fill" />
                    </span>
                  </div>
                  <div className="row">
                    <Link href={`/swap?index=${c.hook}`} className="btn small primary">Trade</Link>
                    <Link href={`/book?index=${c.hook}`} className="btn small">Live book</Link>
                    <Link href={`/share?index=${c.hook}`} className="btn small">Share</Link>
                    {mine && <Link href="/my" className="btn small">Manage</Link>}
                  </div>
                </>
              ) : (
                <p className="faint" style={{ fontSize: 13.5, margin: 0 }}>Hook deployed, weights not set yet.</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: 12.5, marginTop: 16 }}>
        Values use reference prices (ETH $4,000, BTC $100,000) only to size the cards. Tenbin&apos;s own prices come from each wallet, never an oracle.
      </p>
      <Explain anchor="14-every-screen" points={[
        "Every index launched through the Tenbin factory, found from its on-chain HookDeployed events.",
        "Each card is somebody's wallet. Dollar values use reference prices only to size the cards; the indexes never use an oracle.",
        "Trade against one, open its live Book, or Share its card.",
      ]} />
    </div>
  );
}
