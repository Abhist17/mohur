"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { AquaAbi, MohurHookAbi, MohurLensAbi, MohurTestTokenAbi } from "@/generated/abis";
import { deployment, NETWORK } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { fmt, hookOf, readBook, readFills, TOKEN_STYLE, units, type Book, type FillRow } from "@/lib/mohur";
import { useWallet } from "@/lib/wallet";
import { Concept } from "@/components/Concept";
import { NotDeployed } from "@/components/NotDeployed";
import { TokenIcon } from "@/components/TokenIcon";
import { VenueMark } from "@/components/VenueMark";

type Status = { nonce: bigint; v4: "live" | "paused" | "none"; aqua: ("live" | "paused" | "none")[]; pairs: [Address, Address][]; rwStart: number; rwEnd: number; target: bigint[] };
const DOCKED = 255;
const DURATIONS: [string, number][] = [["Instantly", 0], ["Over 1 hour", 3600], ["Over 6 hours", 21600], ["Over 24 hours", 86400], ["Over 3 days", 259200]];

export default function MyIndex() {
  const d = deployment();
  const w = useWallet();
  const [hook, setHook] = useState<Address | null>();
  const [book, setBook] = useState<Book>();
  const [fills, setFills] = useState<FillRow[]>([]);
  const [st, setSt] = useState<Status>();
  const [px, setPx] = useState<Record<string, number>>({ tWETH: 4000, tWBTC: 100000, tUSDC: 1 });
  const [newW, setNewW] = useState<Record<string, number>>();
  const [dur, setDur] = useState(86400);
  const [splitV4, setSplitV4] = useState(50);
  const [splitAqua, setSplitAqua] = useState(25);
  const [busy, setBusy] = useState<string>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const refresh = useCallback(async () => {
    if (!d || !w.account) return;
    const h = await hookOf(w.account);
    setHook(h ?? null);
    if (!h) return;
    const c = readClient("my index", keys.maker(w.account));
    const b = await readBook(h, w.account);
    setBook(b);
    const [nonce, sh, rwStart, rwEnd, target] = await Promise.all([
      c.readContract({ address: h, abi: MohurHookAbi, functionName: "venueNonce" }) as Promise<bigint>,
      c.readContract({ address: h, abi: MohurHookAbi, functionName: "strategyHash" }) as Promise<Hex>,
      c.readContract({ address: h, abi: MohurHookAbi, functionName: "reweightStart" }) as Promise<bigint>,
      c.readContract({ address: h, abi: MohurHookAbi, functionName: "reweightEnd" }) as Promise<bigint>,
      c.readContract({ address: h, abi: MohurHookAbi, functionName: "targetWeights" }) as Promise<readonly bigint[]>,
    ]);
    const count = async (app: Address, hash: Hex, t: Address) => ((await c.readContract({ address: d.aqua, abi: AquaAbi, functionName: "rawBalances", args: [w.account!, app, hash, t] })) as [bigint, number])[1];
    const state = (n: number) => (n === 0 ? "none" : n === DOCKED ? "paused" : "live") as "live" | "paused" | "none";
    const pairs = b.pairs.map((p) => [p.tokenA, p.tokenB] as [Address, Address]);
    const fillsP = readFills(h, w.account); // in parallel with the status reads
    const [v4n, aquaN] = await Promise.all([
      count(h, sh, b.tokens[0].token),
      Promise.all(b.pairs.map((p) => count(d.swapVM, p.aquaStrategyHash, p.tokenA))),
    ]);
    const v4 = state(v4n);
    const aqua = aquaN.map(state);
    setSt({ nonce, v4, aqua, pairs, rwStart: Number(rwStart), rwEnd: Number(rwEnd), target: [...target] });
    // glide progress follows chain time (what both venues actually price with), not the browser clock
    setNow(Number((await c.getBlock()).timestamp));
    setFills(await fillsP);
  }, [d, w.account]);

  useEffect(() => {
    refresh().catch(() => {});
    const id = setInterval(() => refresh().catch(() => {}), NETWORK === "local" ? 6000 : 20000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (book && !newW) setNewW(Object.fromEntries(book.tokens.map((t, i) => [t.symbol, Math.round(Number(st?.target[i] ?? t.weight) / 1e16)])));
  }, [book, st, newW]);

  if (!d) return <NotDeployed />;
  if (!w.account)
    return (
      <div className="wrap page">
        <div className="page-head"><div className="eyebrow">My index</div><h2>Your stockroom</h2><p>Connect the wallet that runs your index.</p></div>
      </div>
    );
  if (hook === null)
    return (
      <div className="wrap page">
        <div className="page-head"><div className="eyebrow">My index</div><h2>You don&apos;t run an index yet</h2><p>Launch one in six clicks.</p></div>
        <Link href="/create" className="btn primary">Launch an index</Link>
      </div>
    );

  const tokens = book?.tokens ?? [];
  const sym = (a: Address) => tokens.find((t) => t.token === a)?.symbol ?? "?";
  const dec = (a: Address) => tokens.find((t) => t.token === a)?.decimals ?? 18;
  const feeRate = book ? Number(book.fee) / 1e18 : 0.003;

  // ---- performance: reconstruct the starting balances from the fills (every balance change comes from a fill)
  const start: Record<string, number> = {};
  const nowBal: Record<string, number> = {};
  for (const t of tokens) nowBal[t.symbol] = units(t.effectiveBalance, t.decimals);
  for (const t of tokens) start[t.symbol] = nowBal[t.symbol];
  let fees = 0;
  const vol = { "Uniswap v4": 0, "1inch Aqua": 0 } as Record<string, number>;
  for (const f of fills) {
    const si = sym(f.tokenIn), so = sym(f.tokenOut);
    const ain = units(f.amountIn, dec(f.tokenIn)), aout = units(f.amountOut, dec(f.tokenOut));
    start[si] -= ain;
    start[so] += aout;
    fees += ain * feeRate * (px[si] ?? 0);
    vol[f.venue] += ain * (px[si] ?? 0);
  }
  const value = (b: Record<string, number>) => Object.entries(b).reduce((a, [s, v]) => a + v * (px[s] ?? 0), 0);
  const vNow = value(nowBal), vHold = value(start);
  const edge = vNow - vHold;

  // ---- allocation
  const gliding = st && st.rwEnd > now && st.rwEnd > st.rwStart;
  const progress = st && st.rwEnd > st.rwStart ? Math.min(1, Math.max(0, (now - st.rwStart) / (st.rwEnd - st.rwStart))) : 1;
  const sumNew = newW ? Object.values(newW).reduce((a, b) => a + b, 0) : 0;

  // ---- writes
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch {}
    setBusy(undefined);
    refresh().catch(() => {});
  };
  const c = () => readClient("manage", keys.maker(w.account));

  const pause = () => run("Pausing…", async () => {
    if (!st || !hook || !book) return;
    const sh = (await c().readContract({ address: hook, abi: MohurHookAbi, functionName: "strategyHash" })) as Hex;
    if (st.v4 === "live") await w.write({ address: d.aqua, abi: AquaAbi, functionName: "dock", args: [hook, sh, tokens.map((t) => t.token)], label: "Pause Uniswap venue" });
    for (let k = 0; k < book.pairs.length; k++) {
      if (st.aqua[k] !== "live") continue;
      const p = book.pairs[k];
      await w.write({ address: d.aqua, abi: AquaAbi, functionName: "dock", args: [d.swapVM, p.aquaStrategyHash, [p.tokenA, p.tokenB]], label: `Pause 1inch ${sym(p.tokenA)}/${sym(p.tokenB)}` });
    }
  });

  const resume = () => run("Opening venues…", async () => {
    if (!st || !hook || !book) return;
    if (st.v4 === "live" || st.aqua.includes("live")) await pause();
    setBusy("Opening venues…");
    const n = st.nonce + 1n;
    await w.write({ address: hook, abi: MohurHookAbi, functionName: "setVenueNonce", args: [n], label: "Start a new venue epoch" });
    const bal = async (t: Address) => (await c().readContract({ address: t, abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account!] })) as bigint;
    if (splitV4 > 0) {
      const strat = (await c().readContract({ address: hook, abi: MohurHookAbi, functionName: "strategy", args: [n] })) as Hex;
      const amts = await Promise.all(tokens.map(async (t) => ((await bal(t.token)) * BigInt(splitV4)) / 100n));
      await w.write({ address: d.aqua, abi: AquaAbi, functionName: "ship", args: [hook, strat, tokens.map((t) => t.token), amts], label: `Open Uniswap (${splitV4}% limit)` });
    }
    if (splitAqua > 0)
      for (const [a, b] of st.pairs) {
        const [, strat] = (await c().readContract({ address: d.lens, abi: MohurLensAbi, functionName: "activeAquaOrder", args: [hook, a, b] })) as [unknown, Hex, Hex];
        const amts = [((await bal(a)) * BigInt(splitAqua)) / 100n, ((await bal(b)) * BigInt(splitAqua)) / 100n];
        await w.write({ address: d.aqua, abi: AquaAbi, functionName: "ship", args: [d.swapVM, strat, [a, b], amts], label: `Open 1inch ${sym(a)}/${sym(b)} (${splitAqua}%)` });
      }
  });

  const reweight = () => run("Re-weighting…", async () => {
    if (!hook || !newW || !book) return;
    const ws = tokens.map((t) => BigInt(newW[t.symbol]) * 10n ** 16n);
    if (dur === 0) await w.write({ address: hook, abi: MohurHookAbi, functionName: "setIndex", args: [tokens.map((t) => t.token), ws, book.fee], label: "Switch allocation now" });
    else await w.write({ address: hook, abi: MohurHookAbi, functionName: "scheduleWeights", args: [ws, BigInt(dur)], label: "Start gradual re-weight" });
  });

  const live = st && (st.v4 === "live" || st.aqua.includes("live"));
  const statusTag = !st ? <span className="tag">loading</span> : gliding ? <span className="tag live">re-weighting · {(progress * 100).toFixed(0)}%</span> : live ? <span className="tag live">live on {[st.v4 === "live" && "Uniswap", st.aqua.includes("live") && "1inch"].filter(Boolean).join(" + ")}</span> : <span className="tag sim">paused</span>;

  return (
    <div className="wrap page">
      <div className="page-head spread">
        <div>
          <div className="eyebrow">My index</div>
          <h2>Your stockroom</h2>
          <p>hook <span className="addr">{hook?.slice(0, 10)}…</span></p>
        </div>
        <div className="row">{statusTag}<Link href="/book" className="btn small">Live book</Link></div>
      </div>
      <Concept highlight="wallet" caption={<><b>You stay in control.</b> Pause, top up or re-weight anytime.</>} />

      {/* ---------- performance ---------- */}
      <div className="card">
        <div className="spread">
          <h3>Performance</h3>
          <div className="row" style={{ gap: 8, fontSize: 13 }}>
            <span className="faint">at market prices</span>
            {["tWETH", "tWBTC"].map((s) => (
              <label key={s} className="row" style={{ gap: 4 }}>
                {TOKEN_STYLE[s].name} $<input type="number" value={px[s]} style={{ width: 96 }} onChange={(e) => setPx({ ...px, [s]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
        </div>
        <div className="grid g4" style={{ marginTop: 14 }}>
          <Stat label="Value now" value={`$${fmt(vNow)}`} />
          <Stat label="vs just holding" value={`${edge >= 0 ? "+" : "−"}$${fmt(Math.abs(edge))}`} tone={edge >= 0 ? "good" : "bad"} sub={`hold value $${fmt(vHold)}`} />
          <Stat label="Fees earned" value={`$${fmt(fees)}`} tone="gold" sub={`${fills.length} fills`} />
          <Stat label="Depth without splitting" value={`$${fmt(vNow)} × 2`} sub="one inventory quotes on two venues" />
        </div>
        <div className="row" style={{ marginTop: 14, gap: 24, fontSize: 14 }}>
          <span className="row" style={{ gap: 6 }}><VenueMark venue={0} short /> volume <b className="mono">${fmt(vol["Uniswap v4"])}</b></span>
          <span className="row" style={{ gap: 6 }}><VenueMark venue={1} short /> volume <b className="mono">${fmt(vol["1inch Aqua"])}</b></span>
        </div>
        <p className="faint" style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>vs just holding: fees earned minus LVR.</p>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        {/* ---------- allocation ---------- */}
        <div className="card stack">
          <div className="spread"><h3>Allocation</h3>{gliding && <span className="tag live" data-testid="glide-left">{fmtLeft(st!.rwEnd - now)} left</span>}</div>
          {tokens.map((t, i) => (
            <div key={t.token}>
              <div className="spread" style={{ fontSize: 14 }}>
                <span className="row" style={{ gap: 8 }}><TokenIcon symbol={t.symbol} size={18} />{TOKEN_STYLE[t.symbol]?.name}</span>
                <span className="mono" data-testid={`alloc-now-${t.symbol}`} data-w={Number(t.weight) / 1e16}>
                  now {(Number(t.weight) / 1e16).toFixed(1)}%
                  {gliding && st && <span className="gold"> → {(Number(st.target[i]) / 1e16).toFixed(1)}%</span>}
                </span>
              </div>
              <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${Number(t.weight) / 1e16}%`, background: TOKEN_STYLE[t.symbol]?.color }} /></div>
            </div>
          ))}
          <hr className="sep" style={{ margin: "8px 0" }} />
          <b style={{ fontSize: 14 }}>Change allocation</b>
          {newW && tokens.map((t) => (
            <label key={t.token} className="spread" style={{ fontSize: 14 }}>
              <span className="row" style={{ gap: 8 }}><TokenIcon symbol={t.symbol} size={16} />{TOKEN_STYLE[t.symbol]?.name}</span>
              <span className="row" style={{ gap: 6 }}>
                <input type="number" data-testid={`alloc-in-${t.symbol}`} min={1} max={98} value={newW[t.symbol]} style={{ width: 70 }} onChange={(e) => setNewW({ ...newW, [t.symbol]: Math.max(0, Math.round(Number(e.target.value))) })} />%
              </span>
            </label>
          ))}
          <div className="spread">
            <select data-testid="reweight-dur" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
              {DURATIONS.map(([l, s]) => <option key={s} value={s}>{l}</option>)}
            </select>
            <button className="btn primary small" data-testid="reweight-go" disabled={!!busy || sumNew !== 100} onClick={reweight}>
              {sumNew !== 100 ? `Total ${sumNew}% (needs 100)` : dur === 0 ? "Switch now" : "Start gradual re-weight"}
            </button>
          </div>
          <p className="faint" style={{ fontSize: 13, margin: 0 }}>
            {dur === 0
              ? "Instant: arbitrageurs take the whole gap ($1,991 on $100k in tests)."
              : "Gradual: traders walk you there and pay fees ($25 vs $1,991 in tests)."}
          </p>
        </div>

        {/* ---------- venues ---------- */}
        <div className="card stack">
          <h3>Venues</h3>
          <table>
            <thead><tr><th>Venue</th><th>Status</th><th className="num">ETH it may sell</th></tr></thead>
            <tbody>
              <tr>
                <td><VenueMark venue={0} /></td>
                <td>{st ? <VenueTag s={st.v4} /> : "…"}</td>
                <td className="num" data-testid="my-limit-v4" data-raw={String(tokens[0]?.v4Limit ?? 0n)}>{fmt(units(tokens[0]?.v4Limit ?? 0n, tokens[0]?.decimals ?? 18))}</td>
              </tr>
              <tr>
                <td><VenueMark venue={1} /></td>
                <td>{st ? <VenueTag s={st.aqua.includes("live") ? "live" : st.aqua.includes("paused") ? "paused" : "none"} /> : "…"}</td>
                <td className="num" data-testid="my-limit-aqua" data-raw={String(tokens[0]?.aquaLimit ?? 0n)}>{fmt(units(tokens[0]?.aquaLimit ?? 0n, tokens[0]?.decimals ?? 18))}</td>
              </tr>
            </tbody>
          </table>
          <div>
            <div className="spread" style={{ fontSize: 14 }}><span>Uniswap may sell</span><b className="mono">{splitV4}% of each coin</b></div>
            <input type="range" data-testid="split-v4" min={0} max={100} value={splitV4} onChange={(e) => setSplitV4(Number(e.target.value))} />
            <div className="spread" style={{ fontSize: 14 }}><span>1inch may sell, per pair</span><b className="mono">{splitAqua}% of each coin</b></div>
            <input type="range" data-testid="split-aqua" min={0} max={50} value={splitAqua} onChange={(e) => setSplitAqua(Number(e.target.value))} />
            <p className="faint" style={{ fontSize: 13, margin: "4px 0 0" }}>Caps, not piles: coins stay in your wallet.</p>
          </div>
          <div className="row">
            <button className="btn primary small" data-testid="topup" disabled={!!busy || !st} onClick={resume}>{live ? "Top up / re-split" : "Resume trading"}</button>
            <button className="btn small" disabled={!!busy || !live} onClick={pause}>Pause both venues</button>
            {busy && <span className="faint" style={{ fontSize: 13 }} data-testid="my-busy">{busy}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "gold" }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
      <div className={`serif ${tone ?? ""}`} style={{ fontSize: 34, lineHeight: 1.15 }}>{value}</div>
      {sub && <div className="faint" style={{ fontSize: 12.5 }}>{sub}</div>}
    </div>
  );
}

function VenueTag({ s }: { s: "live" | "paused" | "none" }) {
  return <span className={`tag ${s === "live" ? "live" : "sim"}`}>{s === "live" ? "live" : s === "paused" ? "paused" : "not open"}</span>;
}

function fmtLeft(sec: number) {
  if (sec <= 0) return "done";
  if (sec < 3600) return `${Math.ceil(sec / 60)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86400).toFixed(1)} days`;
}
