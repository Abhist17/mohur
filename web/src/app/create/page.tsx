"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_DRAFT, loadDraft, saveDraft, setWeight, type Draft } from "@/lib/draft";
import { fmt, sim, TOKEN_STYLE } from "@/lib/mohur";
import { MohurLensAbi } from "@/generated/abis";
import { deployment } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { TokenIcon } from "@/components/TokenIcon";
import { Concept } from "@/components/Concept";
import { Explain } from "@/components/Explain";

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

  // the preview runs the contracts' own MohurMath through MohurLens (pure functions), not a JS copy
    const scaled = (s: string) => BigInt(Math.round(bal(s) * 1e6)) * 10n ** 12n; // 18-dec example balance
  const wOf = (s: string) => BigInt(d.weights[s]) * 10n ** 16n;
  const [onchain, setOnchain] = useState<Record<string, { spot: bigint; out: bigint; amt: bigint }>>({});
  const lens = deployment()?.lens;
  const key = JSON.stringify([d.weights, size]);
  useEffect(() => {
    if (!lens) return;
    const c = readClient("create: preview (MohurMath)", keys.public);
    let alive = true;
    Promise.all(
      pairs.map(async ([a, b]) => {
        const amt = scaled(a) / 100n; // sell 1%
        const [spot, out] = await Promise.all([
          c.readContract({ address: lens, abi: MohurLensAbi, functionName: "previewSpot", args: [scaled(a), wOf(a), scaled(b), wOf(b)] }) as Promise<bigint>,
          c.readContract({ address: lens, abi: MohurLensAbi, functionName: "previewOutGivenIn", args: [scaled(a), wOf(a), scaled(b), wOf(b), amt, 3n * 10n ** 15n] }) as Promise<bigint>,
        ]);
        return [a + b, { spot, out, amt }] as const;
      }),
    )
      .then((rows) => alive && setOnchain(Object.fromEntries(rows)))
      .catch(() => alive && setOnchain({}));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lens]);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div className="eyebrow">Step 1 · Create</div>
        <h2>Design your index</h2>
        <p>Pick coins and drag the weights.</p>
      </div>
      <Concept highlight="wallet" caption={<><b>Your weights are the strategy.</b> Both stalls price to keep you on them.</>} />
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
                <span className="mono" style={{ fontSize: 20 }} data-testid={`weight-value-${s}`}>{d.weights[s]}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={d.weights[s]} disabled={!(d.weights[s] > 0)} data-testid={`weight-${s}`} aria-label={`${TOKEN_STYLE[s].name} weight`}
                onChange={(e) => update({ weights: setWeight(d.weights, s, Number(e.target.value)) })}
              />
            </div>
          ))}
          <div className="bar" style={{ height: 14 }}>
            {SYMS.map((s) => <span key={s} style={{ width: `${d.weights[s]}%`, background: TOKEN_STYLE[s].color }} />)}
          </div>
          <div className="spread faint" style={{ fontSize: 13 }}>
            <span>Total <span data-testid="weight-total">{SYMS.reduce((a, s) => a + d.weights[s], 0)}</span>% · fee 0.30%</span>
            <span>min 1% per asset</span>
          </div>
        </div>

        <div className="card">
          <div className="spread">
            <h3>Preview</h3>
            <span className="tag sim" title="Example balances; the numbers come from the contracts' own math via MohurLens">
              {Object.keys(onchain).length ? "example book · contract math" : "example book · approx"}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Index size $
            <input type="number" value={size} onChange={(e) => setSize(Math.max(1000, Number(e.target.value)))} style={{ width: 110, margin: "0 6px" }} />
          </p>
          <table>
            <thead><tr><th>Pair</th><th className="num">Spot</th><th className="num">Sell 1% → cost</th></tr></thead>
            <tbody>
              {pairs.map(([a, b]) => {
                const wa = d.weights[a] / 100, wb = d.weights[b] / 100;
                const oc = onchain[a + b];
                const spot = oc ? Number(oc.spot) / 1e18 : sim.spot(bal(a), wa, bal(b), wb);
                const amt = oc ? Number(oc.amt) / 1e18 : bal(a) * 0.01;
                const out = oc ? Number(oc.out) / 1e18 : sim.outGivenIn(bal(a), wa, bal(b), wb, amt);
                return (
                  <tr
                    key={a + b}
                    data-testid="preview-row"
                    data-pair={`${a}/${b}`}
                    data-source={oc ? "lens" : "js"}
                    data-args={oc ? JSON.stringify([scaled(a), wOf(a), scaled(b), wOf(b), oc.amt].map(String)) : ""}
                    data-spot={oc ? String(oc.spot) : ""}
                    data-out={oc ? String(oc.out) : ""}
                  >
                    <td>{TOKEN_STYLE[a].name}/{TOKEN_STYLE[b].name}</td>
                    <td className="num">{fmt(spot, 6)}</td>
                    <td className="num">{fmt(amt, 4)} → {fmt(out, 6)} <span className="faint">({(((spot * amt - out) / (spot * amt)) * 100).toFixed(2)}%)</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Link href="/launch" className="btn primary" style={{ marginTop: 8 }}>Launch →</Link>
        </div>
      </div>
      <Explain anchor="11-launching-an-index" points={[
        "Pick tokens and target weights. Preview prices come from the contracts' own math (MohurLens), not a JavaScript copy.",
        "Use a dedicated wallet: quotes read its live balances, so spending index coins elsewhere moves the prices.",
      ]} />
    </div>
  );
}
