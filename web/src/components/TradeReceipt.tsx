"use client";

import { useState } from "react";
import { EXPLORER } from "@/lib/config";
import { VenueLogo } from "./VenueMark";

export type Receipt = {
  venue: 0 | 1;
  amountIn: string;
  symbolIn: string;
  got: string;
  otherQuote: string;
  symbolOut: string;
  gapWei: string;
  tx: string;
};

const SITE = "https://abhist17.github.io/unison/";
const VENUE = ["Uniswap v4", "1inch Aqua"] as const;

/** Shown after a real swap: what you got, what the other venue would have given (the same), and a way to share it. */
export function TradeReceipt({ r, onClose }: { r: Receipt; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const other = r.venue === 0 ? 1 : 0;
  const text = `I swapped ${r.amountIn} ${r.symbolIn} for ${r.got} ${r.symbolOut} on ${VENUE[r.venue]} with Unison. ${VENUE[other]} quoted exactly the same: ${r.gapWei} wei apart. One wallet, one price, every venue.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${SITE}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="card receipt" data-testid="trade-receipt" role="status">
      <div className="spread">
        <span className="receipt-tag">Trade receipt</span>
        <button className="btn small" onClick={onClose} aria-label="Close receipt">✕</button>
      </div>
      <div className="receipt-main">
        <span className="row" style={{ gap: 8 }}><VenueLogo venue={r.venue} size={20} /> Filled on {VENUE[r.venue]}</span>
        <b data-testid="receipt-got">{r.got} {r.symbolOut}</b>
        <span className="muted">for {r.amountIn} {r.symbolIn}</span>
      </div>
      <div className="receipt-compare">
        <span className="row" style={{ gap: 8 }}><VenueLogo venue={other} size={18} /> {VENUE[other]} quoted</span>
        <b>{r.otherQuote} {r.symbolOut}</b>
        <span className={`tag ${r.gapWei === "0" ? "live" : ""}`} data-testid="receipt-gap">{r.gapWei} wei apart</span>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        <button className="btn small primary" onClick={copy} data-testid="receipt-copy">{copied ? "Copied" : "Copy to share"}</button>
        <a className="btn small" target="_blank" rel="noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SITE)}`}>Share on X ↗</a>
        {EXPLORER ? (
          <a className="btn small" target="_blank" rel="noreferrer" href={`${EXPLORER}/tx/${r.tx}`}>View transaction ↗</a>
        ) : (
          <span className="faint mono" style={{ fontSize: 12, alignSelf: "center" }}>tx {r.tx.slice(0, 10)}…</span>
        )}
      </div>
    </div>
  );
}
