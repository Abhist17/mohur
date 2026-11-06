"use client";

import { fmt, units, type Book } from "@/lib/unison";
import { LineChart } from "./Chart";

type Row = { sym: string; delta: number; p: number };

/**
 * Drag ETH's outside price and see what happens to the wallet (pool formula, labelled as such):
 * if nobody traded its ETH share would drift; traders bring it back to target and pay the wallet a fee.
 * The slider sets the same ETH price the Book's price inputs use, so the "Rebalancing, live" panel follows it.
 */
export function MoveTheMarket({
  book,
  px,
  setPx,
  rb,
}: {
  book: Book;
  px: Record<string, number>;
  setPx: (p: Record<string, number>) => void;
  rb?: { rows: Row[]; profit: number; feeCost: number };
}) {
  const e = book.tokens.find((t) => t.symbol === "tWETH"), u = book.tokens.find((t) => t.symbol === "tUSDC");
  if (!e || !u) return null;
  const E = units(e.effectiveBalance, 18), U = units(u.effectiveBalance, 6);
  const wE = Number(e.weight) / 1e18, wU = Number(u.weight) / 1e18;
  if (!(E > 0 && U > 0 && wE > 0 && wU > 0)) return null;
  const p0 = (wE / wU) * (U / E); // the wallet's own ETH price
  const others = book.tokens.filter((t) => t.symbol !== "tWETH").reduce((a, t) => a + units(t.effectiveBalance, t.decimals) * (px[t.symbol] ?? 0), 0);
  const xs = Array.from({ length: 31 }, (_, i) => +(p0 * (0.5 + i * 0.05)).toFixed(2));
  const k = (px.tWETH ?? p0) / p0;
  const eth = rb?.rows.find((r) => r.sym === "tWETH");
  const usd = (v: number) => "$" + fmt(v);
  const moves = eth && Math.abs(eth.delta * eth.p) >= 1;
  return (
    <div className="card" style={{ marginTop: 16 }} data-testid="move-market">
      <div className="spread" style={{ alignItems: "baseline" }}>
        <h3>Move the market</h3>
        <span className="tag sim">pool formula</span>
      </div>
      <p className="muted" style={{ fontSize: 14, margin: "4px 0 12px" }}>
        Drag ETH&apos;s price on the outside market. If nobody traded, the wallet&apos;s ETH share would drift. Traders don&apos;t let it: they buy what is cheap
        from the wallet until it is back at {Math.round(wE * 100)}%, and pay the wallet a fee on every trade.
      </p>
      <label className="stack" style={{ gap: 6 }}>
        <span className="spread" style={{ fontSize: 14 }}>
          <span>
            ETH market price <b className="mono">{usd(px.tWETH ?? p0)}</b> <span className="faint">({k.toFixed(2)}× the wallet&apos;s price)</span>
          </span>
          <button className="btn small" onClick={() => setPx({ ...px, tWETH: +p0.toFixed(2) })}>Reset</button>
        </span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.01}
          value={Math.min(2, Math.max(0.5, k))}
          data-testid="market-slider"
          aria-label="ETH market price, as a multiple of the wallet's own price"
          onChange={(ev) => setPx({ ...px, tWETH: +(p0 * Number(ev.target.value)).toFixed(2) })}
        />
      </label>
      <LineChart
        x={xs}
        series={[
          { name: "If nobody trades", color: "var(--c-hold)", points: xs.map((p) => ((E * p) / (E * p + others)) * 100), endLabel: true },
          { name: "After traders rebalance", color: "var(--c-unison)", points: xs.map(() => wE * 100), endLabel: true },
        ]}
        xFmt={usd}
        yFmt={(v) => `${v.toFixed(0)}%`}
        xLabel="ETH market price"
        yLabel="ETH share of the wallet"
        markX={px.tWETH}
        markLabel="you are here"
        height={220}
      />
      <div className="grid g3" style={{ marginTop: 12 }} data-testid="market-effects">
        <div>
          <div className="faint" style={{ fontSize: 12.5 }}>Traders would</div>
          <b className="mono" style={{ fontSize: 18 }}>{moves ? `${eth!.delta > 0 ? "sell the wallet" : "buy"} ${fmt(Math.abs(eth!.delta))} ETH` : "do nothing"}</b>
        </div>
        <div>
          <div className="faint" style={{ fontSize: 12.5 }}>Their profit, before fees</div>
          <b className="mono" style={{ fontSize: 18 }}>{usd(Math.max(0, rb?.profit ?? 0))}</b>
        </div>
        <div>
          <div className="faint" style={{ fontSize: 12.5 }}>Fee the wallet earns</div>
          <b className="mono good" style={{ fontSize: 18 }} data-testid="market-fee">{usd(rb && rb.profit > 0 ? rb.feeCost : 0)}</b>
        </div>
      </div>
    </div>
  );
}
