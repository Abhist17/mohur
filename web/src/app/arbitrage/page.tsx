"use client";

import { useEffect, useState } from "react";
import { formatUnits, maxUint256, parseUnits, type Address } from "viem";
import { MohurLoopRouterAbi, MohurTestTokenAbi } from "@/generated/abis";
import { deployment } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { fmt, quoteRoute, TOKEN_STYLE } from "@/lib/mohur";
import { useWallet } from "@/lib/wallet";
import { useIndex } from "@/components/useIndex";
import { NotDeployed } from "@/components/NotDeployed";
import { Concept } from "@/components/Concept";

type Leg = { venue: 0 | 1; to: string };
const SYMS = ["tWETH", "tWBTC", "tUSDC"] as const;
const VENUE = ["Uniswap v4", "1inch Aqua"];

export default function ArbitragePage() {
  const d = deployment();
  const w = useWallet();
  const { hook } = useIndex();
  const [start, setStart] = useState<string>("tWETH");
  const [amount, setAmount] = useState("0.1");
  const [legs, setLegs] = useState<Leg[]>([
    { venue: 0, to: "tUSDC" },
    { venue: 1, to: "tWBTC" },
    { venue: 0, to: "tWETH" },
  ]);
  const [quote, setQuote] = useState<{ amounts: bigint[]; withinLimits: boolean }>();
  const [result, setResult] = useState<bigint[]>();
  const [ranQuote, setRanQuote] = useState<bigint[]>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState("");

  const addr = (s: string) => d![s as (typeof SYMS)[number]] as Address;
  const dec = (s: string) => TOKEN_STYLE[s].decimals;
  const path = [start, ...legs.map((l) => l.to)];
  const valid = legs.length > 0 && path.every((s, i) => i === 0 || s !== path[i - 1]);
  const end = path[path.length - 1];

  const doQuote = async () => {
    if (!hook || !valid) return;
    setErr(undefined);
    try {
      const q = await quoteRoute(hook, path.map(addr), legs.map((l) => l.venue), parseUnits(amount || "0", dec(start)), w.account);
      setQuote(q);
    } catch (e) {
      setQuote(undefined);
      setErr(String((e as Error).message).slice(0, 240));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setResult(undefined); setRanQuote(undefined); doQuote(); }, [hook, start, amount, JSON.stringify(legs)]);

  const runIt = async () => {
    if (!d || !hook || !w.account || !quote) return;
    setErr(undefined);
    try {
      const c = readClient("arbitrage: balances", keys.trader(w.account));
      const t = addr(start);
      const need = parseUnits(amount, dec(start));
      const bal = (await c.readContract({ address: t, abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account] })) as bigint;
      if (bal < need) { setBusy("Getting test tokens…"); await w.write({ address: t, abi: MohurTestTokenAbi, functionName: "faucet", label: "faucet" }); }
      const al = (await c.readContract({ address: t, abi: MohurTestTokenAbi, functionName: "allowance", args: [w.account, d.loopRouter] })) as bigint;
      if (al < need) { setBusy("Approving the loop router…"); await w.write({ address: t, abi: MohurTestTokenAbi, functionName: "approve", args: [d.loopRouter, maxUint256], label: "approve loop router" }); }
      setBusy("Running the route…");
      const endBefore = (await c.readContract({ address: addr(end), abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account] })) as bigint;
      const startBefore = (await c.readContract({ address: t, abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account] })) as bigint;
      await w.write({ address: d.loopRouter, abi: MohurLoopRouterAbi, functionName: "execute", args: [hook, path.map(addr), legs.map((l) => l.venue), need, 0n, w.account], label: "run route" });
      const endAfter = (await c.readContract({ address: addr(end), abi: MohurTestTokenAbi, functionName: "balanceOf", args: [w.account] })) as bigint;
      const got = end === start ? endAfter - (startBefore - need) : endAfter - endBefore;
      setRanQuote(quote.amounts);
      setResult([...quote.amounts.slice(0, -1), got]);
      setBusy("");
      await doQuote();
    } catch (e) {
      setBusy("");
      setErr(String((e as Error).message).slice(0, 300));
    }
  };

  if (!d) return <NotDeployed />;
  const isLoop = end === start;
  const outAmt = quote?.amounts[quote.amounts.length - 1];
  const inAmt = quote?.amounts[0];
  const lossBps = isLoop && outAmt !== undefined && inAmt ? (Number(inAmt - outAmt) / Number(inAmt)) * 10_000 : undefined;

  return (
    <div className="wrap page">
      <div className="page-head">
        <div className="eyebrow">Arbitrage me</div>
        <h2>Try to beat the price</h2>
        <p>Build a loop across both venues. Run it for real. It loses.</p>
      </div>
      <Concept caption={<><b>One shelf, no gap.</b> Every round trip pays the fee back to the wallet.</>} />
      <div className="grid g2">
        <div className="card stack">
          <h3>Route</h3>
          <div className="row">
            <span className="muted" style={{ width: 56 }}>Start</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} />
            <select value={start} onChange={(e) => setStart(e.target.value)}>
              {SYMS.map((s) => <option key={s} value={s}>{TOKEN_STYLE[s].name}</option>)}
            </select>
          </div>
          {legs.map((l, i) => (
            <div key={i} className="row">
              <span className="mono faint" style={{ width: 56 }}>leg {i + 1}</span>
              <select value={l.venue} onChange={(e) => setLegs(legs.map((x, k) => (k === i ? { ...x, venue: Number(e.target.value) as 0 | 1 } : x)))}>
                <option value={0}>Uniswap v4</option>
                <option value={1}>1inch Aqua</option>
              </select>
              <span className="faint">→</span>
              <select value={l.to} onChange={(e) => setLegs(legs.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)))}>
                {SYMS.map((s) => <option key={s} value={s}>{TOKEN_STYLE[s].name}</option>)}
              </select>
              <button className="btn small" onClick={() => setLegs(legs.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
          <div className="row">
            <button className="btn small" onClick={() => setLegs([...legs, { venue: 1, to: start }])}>+ leg</button>
            {!valid && <span className="err">Each leg must change token.</span>}
          </div>
        </div>

        <div className="card stack">
          <div className="spread">
            <h3>Quote</h3>
            <span className="tag live">eth_call</span>
          </div>
          {quote && (
            <table>
              <tbody>
                {path.map((s, i) => (
                  <tr key={i}>
                    <td className="faint">{i === 0 ? "in" : VENUE[legs[i - 1].venue]}</td>
                    <td className="num">{fmt(Number(formatUnits(quote.amounts[i], dec(s))), 8)} {TOKEN_STYLE[s].name}</td>
                    
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {lossBps !== undefined && (
            <div className="spread">
              <span className="muted">Loop result</span>
              <span className={`mono ${lossBps > 0 ? "bad" : "good"}`} style={{ fontSize: 22 }} data-testid="arb-loss" data-bps={lossBps.toFixed(2)}>
                {lossBps > 0 ? "−" : "+"}{Math.abs(lossBps).toFixed(1)} bps
              </span>
            </div>
          )}
          {quote && !quote.withinLimits && <div className="banner">A leg exceeds that venue&apos;s remaining Aqua limit; running it would revert.</div>}
          {result && ranQuote && (
            <div className={result[result.length - 1] === ranQuote[ranQuote.length - 1] ? "good" : "bad"} data-testid="arb-result" data-match={String(result[result.length - 1] === ranQuote[ranQuote.length - 1])} data-in={String(ranQuote[0])} data-out={String(result[result.length - 1])}>
              {result[result.length - 1] === ranQuote[ranQuote.length - 1]
                ? `Ran for real: returned exactly its quote (${formatUnits(result[result.length - 1], dec(end))} ${end}). Re-quoted on the new balances above.`
                : "Executed amount differs from the quote (state changed in between)."}
            </div>
          )}
          <button className="btn primary" data-testid="arb-run" disabled={!w.account || !quote || !!busy || !valid} onClick={runIt}>
            {busy || (w.account ? "Run it for real" : "Connect to run")}
          </button>
          {err && <div className="err">{err}</div>}
        </div>
      </div>
    </div>
  );
}
