"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, maxUint256, parseUnits, type Address } from "viem";
import { UnisonHookAbi, UnisonLoopRouterAbi, UnisonTestTokenAbi } from "@/generated/abis";
import { deployment, NETWORK } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { prettyError } from "@/lib/errors";
import { quoteBoth, readBook, TOKEN_STYLE, type Book } from "@/lib/unison";
import { useWallet } from "@/lib/wallet";
import { TokenIcon } from "@/components/TokenIcon";
import { NotDeployed } from "@/components/NotDeployed";
import { Concept } from "@/components/Concept";
import { usePoll, useIndex } from "@/components/useIndex";
import { VenueMark } from "@/components/VenueMark";
import { Explain } from "@/components/Explain";
import { GasHint } from "@/components/GasHint";

const SYMS = ["tWETH", "tWBTC", "tUSDC"] as const;
type Sym = (typeof SYMS)[number];
const VENUES = ["Uniswap v4", "1inch Aqua"] as const;
const SLIPPAGE_BPS = 50n; // 0.5%

type Quote = { v4Out: bigint; v4Ok: boolean; aquaOut: bigint; aquaOk: boolean; spot: bigint; err?: string };

function show(v: bigint | undefined, dec: number, max = 6) {
  if (v === undefined) return "";
  const n = Number(formatUnits(v, dec));
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: max });
}

function TokenPicker({ value, onPick }: { value: Sym; onPick: (s: Sym) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button className="tok-btn" onClick={() => setOpen(!open)}>
        <TokenIcon symbol={value} size={26} /> {TOKEN_STYLE[value].name} <span className="faint">▾</span>
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: 44 }} onMouseLeave={() => setOpen(false)}>
          {SYMS.map((s) => (
            <button key={s} onClick={() => { onPick(s); setOpen(false); }}>
              <TokenIcon symbol={s} /> {TOKEN_STYLE[s].name} <span className="faint mono" style={{ marginLeft: "auto", fontSize: 12 }}>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SwapPage() {
  const d = deployment();
  const w = useWallet();
  const [mine, setMine] = useState(false);
  const idx = useIndex(true);
  const hook = mine && idx.ownHook ? idx.ownHook : idx.hook;
  const isOwn = mine && !!idx.ownHook;
  const [tin, setTin] = useState<Sym>("tUSDC");
  const [tout, setTout] = useState<Sym>("tWETH");
  const [amount, setAmount] = useState("1000");
  const [venue, setVenue] = useState<0 | 1>(0);
  const [book, setBook] = useState<Book>();
  const [quote, setQuote] = useState<Quote>();
  const [quoting, setQuoting] = useState(false);
  const [bal, setBal] = useState<Record<string, bigint>>({});
  const [allow, setAllow] = useState<bigint>(0n);
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();

  // prefill from a link, e.g. /swap?in=tUSDC&out=tWETH&amount=500 (the Live book's "Be that trader")
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const i = q.get("in") as Sym | null, o = q.get("out") as Sym | null, a = q.get("amount");
    if (i && SYMS.includes(i)) setTin(i);
    if (o && SYMS.includes(o) && o !== i) setTout(o);
    if (a && /^\d*\.?\d*$/.test(a)) setAmount(a);
    if (q.get("index") === "own") setMine(true);
  }, []);

  const addr = (s: Sym) => d![s] as Address;
  const dec = (s: Sym) => TOKEN_STYLE[s].decimals;
  const amountIn = useMemo(() => {
    try {
      return amount && Number(amount) > 0 ? parseUnits(amount, dec(tin)) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, tin]);

  // balances + allowance (trader isolation key)
  const refreshWallet = useCallback(async () => {
    if (!d || !w.account) return;
    const c = readClient("swap: balances", keys.trader(w.account));
    const b: Record<string, bigint> = {};
    for (const s of SYMS) b[s] = (await c.readContract({ address: addr(s), abi: UnisonTestTokenAbi, functionName: "balanceOf", args: [w.account] })) as bigint;
    setBal(b);
    setAllow((await c.readContract({ address: addr(tin), abi: UnisonTestTokenAbi, functionName: "allowance", args: [w.account, d.loopRouter] })) as bigint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, w.account, tin]);
  useEffect(() => { refreshWallet().catch(() => {}); }, [refreshWallet]);

  usePoll(async () => { if (hook) setBook(await readBook(hook)); }, 15000, [hook]);

  // quote both venues, debounced
  const refreshQuote = useCallback(async () => {
    if (!hook || !d || amountIn === 0n) { setQuote(undefined); return; }
    setQuoting(true);
    try {
      const [q, spot] = await Promise.all([
        quoteBoth(hook, addr(tin), addr(tout), amountIn),
        readClient("swap: spot price", keys.strategy(hook, addr(tin), addr(tout))).readContract({
          address: hook, abi: UnisonHookAbi, functionName: "price", args: [addr(tin), addr(tout)],
        }) as Promise<bigint>,
      ]);
      setQuote({ ...q, spot, err: !q.v4Ok && !q.aquaOk ? "Trade too large for either venue: one trade can move at most 30% of a balance, and each venue sells only up to its limit." : undefined });
      if (venue === 0 && !q.v4Ok && q.aquaOk) setVenue(1);
      if (venue === 1 && !q.aquaOk && q.v4Ok) setVenue(0);
    } catch (e) {
      setQuote({ v4Out: 0n, v4Ok: false, aquaOut: 0n, aquaOk: false, spot: 0n, err: prettyError(e) });
    }
    setQuoting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hook, d, amountIn, tin, tout]);
  useEffect(() => {
    const id = setTimeout(() => refreshQuote(), 350);
    return () => clearTimeout(id);
  }, [refreshQuote]);
  useEffect(() => {
    const id = setInterval(() => refreshQuote(), NETWORK === "local" ? 8000 : 25000);
    return () => clearInterval(id);
  }, [refreshQuote]);

  if (!d) return <NotDeployed />;

  const out = quote ? (venue === 0 ? quote.v4Out : quote.aquaOut) : undefined;
  const ok = quote ? (venue === 0 ? quote.v4Ok : quote.aquaOk) : false;
  const minOut = out !== undefined ? (out * (10_000n - SLIPPAGE_BPS)) / 10_000n : 0n;
  // price impact vs spot (spot is 18-dec, decimal-normalised: 1 tin = spot/1e18 tout)
  const inN = Number(formatUnits(amountIn, dec(tin)));
  const outN = out !== undefined ? Number(formatUnits(out, dec(tout))) : 0;
  const spotN = quote ? Number(quote.spot) / 1e18 : 0;
  // price impact excludes the 0.30% fee (shown on its own line)
  const impact = quote && spotN > 0 && inN > 0 && outN > 0 ? Math.max(0, 1 - outN / (inN * 0.997 * spotN)) : undefined;
  const balIn = bal[tin] ?? 0n;
  const limit = (s: Sym, v: 0 | 1) => {
    const t = book?.tokens.find((x) => x.symbol === s);
    return t ? (v === 0 ? t.v4Limit : t.aquaLimit) : undefined;
  };

  const flip = () => { setTin(tout); setTout(tin); setAmount(out ? formatUnits(out, dec(tout)) : amount); };
  const pickIn = (s: Sym) => (s === tout ? flip() : setTin(s));
  const pickOut = (s: Sym) => (s === tin ? flip() : setTout(s));

  const act = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(label);
    setErr(undefined);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(undefined);
    refreshWallet().catch(() => {});
    refreshQuote().catch(() => {});
  };

  let cta: { label: string; onClick?: () => void; primary?: boolean } = { label: "Enter an amount" };
  if (!w.account) {
    cta = w.localAccounts.length
      ? { label: "Connect dev trader", onClick: () => w.connectLocal(1), primary: true }
      : { label: "Connect wallet", onClick: () => w.connectInjected(), primary: true };
  } else if (amountIn === 0n) cta = { label: "Enter an amount" };
  else if (balIn < amountIn)
    cta = { label: `Get test ${TOKEN_STYLE[tin].name}`, primary: true, onClick: () => act(() => w.write({ address: addr(tin), abi: UnisonTestTokenAbi, functionName: "faucet", label: `Get test ${tin}` }), "Getting test tokens…") };
  else if (!quote) cta = { label: quoting ? "Fetching quote…" : "Getting a quote…" }; // also before the first request fires: never show a limit message without a quote
  else if (quote?.err) cta = { label: "Amount too large" };
  else if (!ok) {
    // the other venue may still fill it: offer the switch instead of a dead end
    const other = (venue === 0 ? 1 : 0) as 0 | 1;
    const otherOk = quote ? (other === 0 ? quote.v4Ok : quote.aquaOk) : false;
    cta = otherOk
      ? { label: `Over ${VENUES[venue]}'s limit · use ${VENUES[other]}`, primary: true, onClick: () => setVenue(other) }
      : { label: "Over both venues' limits · try a smaller amount" };
  }
  else if (allow < amountIn)
    cta = { label: `Approve ${TOKEN_STYLE[tin].name}`, primary: true, onClick: () => act(() => w.write({ address: addr(tin), abi: UnisonTestTokenAbi, functionName: "approve", args: [d.loopRouter, maxUint256], label: `Approve ${tin}` }), "Approving…") };
  else
    cta = {
      label: `Swap on ${VENUES[venue]}`,
      primary: true,
      onClick: () => act(() => w.write({ address: d.loopRouter, abi: UnisonLoopRouterAbi, functionName: "execute", args: [hook, [addr(tin), addr(tout)], [venue], amountIn, minOut, w.account], label: `Swap ${amount} ${TOKEN_STYLE[tin].name} → ${TOKEN_STYLE[tout].name}` }), "Swapping…"),
    };

  return (
    <div className="wrap page">
      <div className="swap stack" style={{ gap: 16 }}>
        <GasHint />
        <div className="spread">
          <div>
            <h2 style={{ fontSize: 40 }}>Swap</h2>
            <div className="muted row" style={{ fontSize: 14, gap: 8 }}>
              <span>Against {isOwn ? "your own index" : idx.picked && hook?.toLowerCase() !== d?.demoHook?.toLowerCase() ? "a picked index" : "the demo index"}</span>
              {idx.hasOwn && (
                <button className="tag" style={{ cursor: "pointer" }} onClick={() => setMine(!mine)}>
                  switch to {isOwn ? "demo" : "yours"}
                </button>
              )}
              <Link href="/book" className="accent">live book</Link>
            </div>
          </div>
          <span className="pill">fee 0.30% · slippage 0.5%</span>
        </div>

        <div className="card stack" style={{ gap: 6, padding: 12 }}>
          <div className="swap-box">
            <div className="spread faint" style={{ fontSize: 13 }}>
              <span>You pay</span>
              {w.account && (
                <span>
                  Balance {show(balIn, dec(tin))}{" "}
                  {balIn > 0n && <button className="tag" style={{ cursor: "pointer" }} onClick={() => setAmount(formatUnits(balIn, dec(tin)))}>Max</button>}
                </span>
              )}
            </div>
            <div className="spread" style={{ flexWrap: "nowrap", marginTop: 6 }}>
              <input className="swap-amt" data-testid="swap-amount" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmount(e.target.value)} />
              <TokenPicker value={tin} onPick={pickIn} />
            </div>
          </div>
          <button className="flip" aria-label="Flip direction" onClick={flip}>↓</button>
          <div className="swap-box">
            <div className="spread faint" style={{ fontSize: 13 }}>
              <span>You receive</span>
              {w.account && <span>Balance {show(bal[tout], dec(tout))}</span>}
            </div>
            <div className="spread" style={{ flexWrap: "nowrap", marginTop: 6 }}>
              <div className="swap-amt" style={{ color: out ? "var(--text)" : "var(--faint)" }}>
                {quoting && !quote ? <span className="skel" style={{ width: 140, height: 30 }} /> : out ? show(out, dec(tout), 8) : "0"}
              </div>
              <TokenPicker value={tout} onPick={pickOut} />
            </div>
          </div>

          <div className="venues" style={{ marginTop: 6 }}>
            {([0, 1] as const).map((v) => {
              const vOut = quote ? (v === 0 ? quote.v4Out : quote.aquaOut) : undefined;
              const vOk = quote ? (v === 0 ? quote.v4Ok : quote.aquaOk) : true;
              return (
                <button key={v} className={`venue ${venue === v ? "on" : ""}`} disabled={!!quote && !vOk} data-testid={`venue-${v}`} onClick={() => setVenue(v)}>
                  <div style={{ fontSize: 13 }}>
                    <VenueMark venue={v} size={18} />
                  </div>
                  <div className="mono" style={{ fontSize: 15, marginTop: 4 }}>
                    {quote && vOk ? show(vOut, dec(tout), 8) : quote ? "over limit" : "-"}
                  </div>
                  <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
                    can sell {show(limit(tout, v), dec(tout), 4) || "…"} {TOKEN_STYLE[tout].name}
                  </div>
                </button>
              );
            })}
          </div>
          {quote && quote.v4Ok && quote.aquaOk && (
            <div className="good" style={{ fontSize: 12, textAlign: "center" }}>
              ✓ Same price on both venues ({(quote.v4Out - quote.aquaOut).toString()} units apart)
            </div>
          )}

          {quote && !quote.err && out !== undefined && out > 0n && (
            <div style={{ padding: "6px 4px 2px" }}>
              <div className="kv"><span>Rate</span><b>1 {TOKEN_STYLE[tin].name} = {spotN.toLocaleString(undefined, { maximumSignificantDigits: 6 })} {TOKEN_STYLE[tout].name}</b></div>
              <div className="kv"><span>Price impact</span><b className={impact !== undefined && impact > 0.03 ? "bad" : ""}>{impact !== undefined ? `${(impact * 100).toFixed(2)}%` : "-"}</b></div>
              <div className="kv"><span>Fee</span><b>0.30%</b></div>
              <div className="kv"><span>Minimum received</span><b>{show(minOut, dec(tout), 8)} {TOKEN_STYLE[tout].name}</b></div>
              <div className="kv"><span>Settles from</span><b>the maker&apos;s wallet, via Aqua</b></div>
            </div>
          )}
          {quote?.err && <div className="err" style={{ padding: "4px" }}>{quote.err}</div>}

          <button className={`btn block ${cta.primary ? "primary" : ""}`} data-testid="swap-cta" disabled={!cta.onClick || !!busy} onClick={cta.onClick} style={{ marginTop: 6 }}>
            {busy ?? cta.label}
          </button>
          {err && <div className="err" style={{ textAlign: "center" }}>{err}</div>}
        </div>

        <Concept caption={<><b>Same price on both.</b> Pick either venue. Testnet tokens.</>} />
      </div>
      <Explain anchor="4-a-trade-on-uniswap-v4" points={[
        "Both venue quotes come from one function over the maker's wallet, which is why they match to the wei.",
        "Uniswap v4 fills through the Unison hook; 1inch fills through SwapVM opcode 0xd0. Coins move between your wallet and the maker's through 1inch Aqua.",
        "“Can sell” is that venue's remaining limit. One trade can move at most 30% of a balance.",
        "Every trade changes the maker's balances, so the next quote moves the same way on both venues.",
      ]} />
    </div>
  );
}
