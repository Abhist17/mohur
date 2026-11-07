"use client";

import Link from "next/link";
import { useState } from "react";
import { NETWORK } from "@/lib/config";
import { fmt, readBook, readFills, TOKEN_STYLE, units, type Book } from "@/lib/tenbin";
import { NotDeployed } from "@/components/NotDeployed";
import { TokenIcon } from "@/components/TokenIcon";
import { AnonMark, VenueMark } from "@/components/VenueMark";
import { usePoll, useIndex } from "@/components/useIndex";
import { Logo } from "@/components/Logo";

/** A shareable card for one index: /share?index=0x… (static-export friendly: the hook is a query param). */
export default function Share() {
  const idx = useIndex(true);
  const [book, setBook] = useState<Book>();
  const [fills, setFills] = useState<number>();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string>();

  usePoll(
    async () => {
      if (!idx.hook || !idx.maker) return;
      try {
        const b = await readBook(idx.hook, idx.maker);
        setBook(b);
        setErr(undefined);
        setFills((await readFills(idx.hook, idx.maker)).length);
      } catch (e) {
        setErr(String((e as Error).message).slice(0, 160));
      }
    },
    NETWORK === "local" ? 10000 : 60000,
    [idx.hook, idx.maker],
  );

  if (!idx.deployed) return <NotDeployed />;
  const hook = idx.hook;
  const sym = (a: string) => book?.tokens.find((t) => t.token.toLowerCase() === a.toLowerCase())?.symbol ?? "?";
  // spot prices straight from the hook's own math (TenbinLens.book → priceAinB, 18 decimals, fee excluded)
  const prices = (book?.pairs ?? []).map((p) => {
    const a = sym(p.tokenA), b = sym(p.tokenB);
    const ab = units(p.priceAinB, 18);
    // show the bigger asset in terms of the smaller one (1 ETH = 4,000 USDC, not 0.00025)
    return ab >= 1 ? { base: a, quote: b, px: ab } : { base: b, quote: a, px: ab > 0 ? 1 / ab : 0 };
  });
  const live = book ? book.tokens.some((t) => t.v4Limit > 0n || t.aquaLimit > 0n) : false;
  const link = typeof window !== "undefined" && hook ? `${window.location.origin}${window.location.pathname}?index=${hook}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="card stack share-card" data-testid="share-card" style={{ gap: 16, padding: 28 }}>
        <div className="spread">
          <span className="brand" style={{ fontSize: 18 }}><Logo size={22} /> Tenbin index</span>
          <span className={`tag ${live ? "live" : "sim"}`}>{!book ? "loading" : live ? "live" : "paused"}</span>
        </div>
        {!book ? (
          <>
            <span className="skel" style={{ width: "60%", height: 28 }} />
            <span className="skel" style={{ height: 12 }} />
            <span className="skel" style={{ width: "70%" }} />
          </>
        ) : (
          <>
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
              {book.tokens.map((t) => (
                <span key={t.token} className="row" style={{ gap: 8 }} data-testid={`share-w-${t.symbol}`}>
                  <TokenIcon symbol={t.symbol} size={26} />
                  <span className="serif" style={{ fontSize: 30 }}>{(Number(t.weight) / 1e16).toFixed(0)}%</span>
                  <span className="muted">{TOKEN_STYLE[t.symbol]?.name ?? t.symbol}</span>
                </span>
              ))}
            </div>
            <div className="bar" style={{ height: 12 }}>
              {book.tokens.map((t) => (
                <span key={t.token} style={{ width: `${Number(t.weight) / 1e16}%`, background: TOKEN_STYLE[t.symbol]?.color }} />
              ))}
            </div>
            <div style={{ display: "grid", gap: 8, fontSize: 14.5 }}>
              {prices.map((p) => (
                <div key={p.base + p.quote} className="spread" data-testid="share-price">
                  <span>1 {TOKEN_STYLE[p.base]?.name ?? p.base}</span>
                  <b>{fmt(p.px, 6)} {TOKEN_STYLE[p.quote]?.name ?? p.quote}</b>
                </div>
              ))}
              <div className="spread"><span>Fee</span><b>{(Number(book.fee) / 1e16).toFixed(2)}%</b></div>
              <div className="spread"><span>Fills, both venues</span><b data-testid="share-fills">{fills ?? "…"}</b></div>
            </div>
            <div className="row faint" style={{ gap: 14, fontSize: 13 }}>
              <span>Same price on</span>
              <VenueMark venue={0} size={16} /> <VenueMark venue={1} size={16} />
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link href={`/swap?index=${hook}`} className="btn primary" data-testid="share-trade">Trade this index</Link>
              <Link href={`/book?index=${hook}`} className="btn">Live book</Link>
              <button className="btn" onClick={copy} data-testid="share-copy">{copied ? "Copied" : "Copy link"}</button>
            </div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              Prices come from this wallet&apos;s balances, not an oracle.{" "}
              {NETWORK === "local" ? "Local fork: reads go straight to the node." : <>Reads via <AnonMark size={12} />.</>}
              <div className="addr" style={{ marginTop: 4 }}>hook {hook}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
