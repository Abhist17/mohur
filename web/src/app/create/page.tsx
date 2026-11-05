"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_DRAFT, loadDraft, saveDraft, setWeight, type Draft } from "@/lib/draft";
import { fmt, sim, TOKEN_STYLE } from "@/lib/mohur";
import { TokenIcon } from "@/components/TokenIcon";
import { Concept } from "@/components/Concept";

const SYMS = ["tWETH", "tWBTC", "tUSDC"];

export default function CreatePage() {
  const [d, setD] = useState<Draft>(DEFAULT_DRAFT);
  const [size, setSize] = useState(100_000);
  useEffect(() => setD(loadDraft()), []);
  const update = (nd: Draft) => {
    setD(nd);
    saveDraft(nd);
  };

  const active = SYMS.filter((s) => d.weights[s] > 0);
  const toggle = (s: string) => {
    const w = { ...d.weights };
    if (w[s] > 0) {
      if (active.length <= 2) return;
      w[s] = 0;
      const rest = SYMS.filter((k) => w[k] > 0);
      const sum = rest.reduce((a, k) => a + w[k], 0);
      rest.forEach((k, i) => (w[k] = i === rest.length - 1 ? 100 - rest.slice(0, -1).reduce((a, j) => a + w[j], 0) : Math.round((w[k] / sum) * 100)));
    } else {
      Object.assign(w, setWeight({ ...w, [s]: 10 }, s, 10));
    }
    update({ weights: w });
  };

  // simulated example book: `size` USD at reference prices
  const bal = (s: string) => (size * d.weights[s]) / 100 / TOKEN_STYLE[s].usdGuess;
  const pairs: [string, string][] = [];
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) pairs.push([active[i], active[j]]);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div className="eyebrow">Step 1 · Create</div>
        <h2>Design your index</h2>
        <p>Pick the assets and target weights. The weights are the whole strategy: both venues price every trade so that, at Mohur&apos;s own prices, your wallet always sits exactly on these weights.</p>
      </div>
      <Concept highlight="wallet" caption={<><b>Decide what&apos;s on the shelf.</b> The weights are the whole strategy: both stalls price every trade so that, at Mohur&apos;s prices, your wallet always sits exactly on them.</>} />
      <div className="grid g2">
        <div className="card stack">
          <h3>Assets &amp; weights</h3>
          {SYMS.map((s) => (
            <div key={s}>
              <div className="spread">
                <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={d.weights[s] > 0} onChange={() => toggle(s)} />
                  <TokenIcon symbol={s} size={20} /> {TOKEN_STYLE[s].name} <span className="faint mono">{s}</span>
                </label>
                <span className="mono" style={{ fontSize: 20 }}>{d.weights[s]}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={d.weights[s]} disabled={!(d.weights[s] > 0)}
                onChange={(e) => update({ weights: setWeight(d.weights, s, Number(e.target.value)) })}
              />
            </div>
          ))}
          <div className="bar" style={{ height: 14 }}>
            {SYMS.map((s) => <span key={s} style={{ width: `${d.weights[s]}%`, background: TOKEN_STYLE[s].color }} />)}
          </div>
          <div className="spread faint" style={{ fontSize: 13 }}>
            <span>Total {SYMS.reduce((a, s) => a + d.weights[s], 0)}% · fee 0.30% on both venues</span>
            <span>min 1% per asset</span>
          </div>
        </div>

        <div className="card">
          <div className="spread">
            <h3>Quote preview</h3>
            <span className="tag sim">simulated</span>
          </div>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Example book worth $
            <input type="number" value={size} onChange={(e) => setSize(Math.max(1000, Number(e.target.value)))} style={{ width: 110, margin: "0 6px" }} />
            at ETH $4,000 and BTC $100,000. The same numbers would show on Uniswap and on 1inch.
          </p>
          <table>
            <thead><tr><th>Pair</th><th className="num">Spot</th><th className="num">Sell 1% of first</th></tr></thead>
            <tbody>
              {pairs.map(([a, b]) => {
                const wa = d.weights[a] / 100, wb = d.weights[b] / 100;
                const spot = sim.spot(bal(a), wa, bal(b), wb);
                const amt = bal(a) * 0.01;
                const out = sim.outGivenIn(bal(a), wa, bal(b), wb, amt);
                return (
                  <tr key={a + b}>
                    <td>{TOKEN_STYLE[a].name}/{TOKEN_STYLE[b].name}</td>
                    <td className="num">{fmt(spot, 6)}</td>
                    <td className="num">{fmt(amt, 4)} → {fmt(out, 6)} <span className="faint">({(((spot * amt - out) / (spot * amt)) * 100).toFixed(2)}%)</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="faint" style={{ fontSize: 12 }}>Cost column = fee + price impact versus spot.</p>
          <Link href="/launch" className="btn primary" style={{ marginTop: 8 }}>Launch this index →</Link>
        </div>
      </div>
    </div>
  );
}
