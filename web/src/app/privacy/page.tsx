"use client";

import { useEffect, useState } from "react";
import { keys as anonKeys, readClient, switchWorker } from "@/lib/anon";
import { parseUnits } from "viem";
import { quoteBoth, readBook } from "@/lib/mohur";
import { usePoll, useIndex } from "@/components/useIndex";
import { NETWORK, WORKERS, type WorkerId } from "@/lib/config";
import { useAnon } from "@/components/Providers";
import { AnonMark } from "@/components/VenueMark";
import { ColumnChart } from "@/components/Chart";

const PROXY = process.env.NEXT_PUBLIC_MOHUR_PROXY_URL;

type ProxyRow = { t: number; ip: string; tor: boolean; method: string };

export default function PrivacyPage() {
  const { log, status } = useAnon();
  const [proxy, setProxy] = useState<ProxyRow[]>();
  const { hook, maker } = useIndex();

  // the dashboard's normal monitoring loop: the book (maker key) and one quote per strategy (strategy keys)
  usePoll(
    async () => {
      if (!hook) return;
      const b = await readBook(hook, maker);
      await Promise.all(
        b.pairs.map((p) => {
          const t = b.tokens.find((x) => x.token === p.tokenA)!;
          return quoteBoth(hook, p.tokenA, p.tokenB, parseUnits(t.symbol === "tWETH" ? "0.1" : t.symbol === "tWBTC" ? "0.003" : "300", t.decimals));
        }),
      );
    },
    NETWORK === "local" ? 8000 : 30000,
    [hook, maker],
  );

  useEffect(() => {
    if (!PROXY) return;
    const load = () =>
      fetch(new URL("/log", PROXY).toString())
        .then((r) => r.json())
        .then((j) => setProxy(j.entries))
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const [probe, setProbe] = useState<{ state: "idle" | "running" | "ok" | "fail"; text?: string; t0?: number }>({ state: "idle" });
  // while the test runs, tick once a second so the wait is visibly alive (mixnets take 5-60 s)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (probe.state !== "running") return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [probe.state]);
  const runProbe = async () => {
    const t0 = performance.now();
    setProbe({ state: "running", t0 });
    try {
      const c = readClient("connection test", anonKeys.public);
      const [chain, block] = await Promise.all([c.getChainId(), c.getBlockNumber()]);
      setProbe({ state: "ok", text: `chain ${chain}, block ${block.toLocaleString()} in ${((performance.now() - t0) / 1000).toFixed(1)} s` });
    } catch (e) {
      setProbe({ state: "fail", text: String((e as Error).message).slice(0, 160) });
    }
  };

  const reads = log.filter((e) => e.route !== "bootstrap");
  const anonShare = reads.length ? (reads.filter((e) => e.route === "anon-rpc").length / reads.length) * 100 : 0;
  const keys = new Map<string, number>();
  for (const e of reads) keys.set(e.isolationKey, (keys.get(e.isolationKey) ?? 0) + 1);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div className="eyebrow row" style={{ gap: 8 }}><AnonMark size={14} label="Privacy · Anon-RPC" /></div>
        <h2>Nobody watching</h2>
        <p>Every read goes through EF&apos;s Anon-RPC. One isolation key per maker, strategy and trader.</p>
      </div>

      {NETWORK === "local" && (
        <div className="banner" style={{ marginBottom: 16 }} data-testid="local-banner">
          Local fork: reads go direct. On Base Sepolia they go through Anon-RPC.
        </div>
      )}

      <div className="grid g3">
        <div className="card">
          <div className="eyebrow faint">Private reads</div>
          <div className="serif" style={{ fontSize: 56 }} data-testid="anon-share" data-reads={reads.length}>{reads.length ? anonShare.toFixed(0) : "-"}%</div>
          <div className="muted" style={{ fontSize: 13 }}>{reads.length} reads this session</div>
        </div>
        <div className="card">
          <div className="eyebrow faint">Isolation keys</div>
          <div className="serif" style={{ fontSize: 56 }}>{keys.size}</div>
          <div className="muted" style={{ fontSize: 13 }}>unlinkable to each other</div>
        </div>
        <div className="card">
          <div className="eyebrow faint">Route</div>
          <div className="serif" style={{ fontSize: 30, marginTop: 6 }}>{WORKERS[status.worker].label}</div>
          <div className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }} title={status.error}>
            {NETWORK === "local"
              ? "not used on the local fork"
              : status.direct
                ? "not in use: you chose to read directly (not private)"
                : status.state === "ready"
                  ? `ready in ${(status.bootMs! / 1000).toFixed(1)} s`
                  : status.state === "failed"
                    ? `failed: ${(status.error ?? "").split(":")[0].slice(0, 90)}${(status.error ?? "").length > 90 ? "…" : ""}`
                    : "connecting…"}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {(Object.keys(WORKERS) as WorkerId[]).map((id) => (
              <button key={id} className={`btn small ${status.worker === id ? "primary" : ""}`} disabled={NETWORK === "local"} onClick={() => switchWorker(id).catch(() => {})}>
                {id}
              </button>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 12 }}>{WORKERS[status.worker].note}</p>
          <div className="row">
            <button className="btn small" data-testid="probe" disabled={probe.state === "running"} onClick={runProbe}>Test the route</button>
            {probe.state !== "idle" && (
              <span data-testid="probe-result" data-state={probe.state} className={`mono ${probe.state === "ok" ? "good" : probe.state === "fail" ? "bad" : "faint"}`} style={{ fontSize: 12 }}>
                {probe.state === "running"
                  ? NETWORK === "local"
                    ? "reading the local node…"
                    : `reading Base Sepolia through ${WORKERS[status.worker].label} · ${Math.floor((performance.now() - (probe.t0 ?? performance.now())) / 1000)} s (mixnets take 5-60 s)…`
                  : probe.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <details className="card more" style={{ marginTop: 16 }}>
        <summary><h3>Who learns what</h3></summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Party</th><th>Plain RPC</th><th>Unison via Anon-RPC</th></tr></thead>
            <tbody>
              <tr><td>RPC provider</td><td>Your IP + every wallet, pair and quote you poll</td><td className="good">A Tor exit (or mix exit) and the requests; not who you are</td></tr>
              <tr><td>Tor relays / gateway</td><td>-</td><td>Guard sees your IP but not the content; exit sees content but not your IP</td></tr>
              <tr><td>Anyone linking reads</td><td>One identity across everything</td><td className="good">One key per maker, per strategy, per trader: separate circuits</td></tr>
              <tr><td>Bootstrap RPC (mainnet)</td><td>-</td><td className="bad">One read of the worker specifier contract (before the anonymous client exists)</td></tr>
              <tr><td>Your wallet&apos;s RPC</td><td>Your transactions</td><td className="bad">Still your transactions: the wallet broadcasts them (excluded)</td></tr>
            </tbody>
          </table>
        </div>
      </details>

      {reads.length > 0 && (
        <div className="card" style={{ marginTop: 16 }} data-testid="latency-chart">
          <div className="spread" style={{ alignItems: "baseline" }}>
            <h3>What privacy costs: time per read</h3>
            <span className="faint" style={{ fontSize: 12.5 }}>last {Math.min(30, reads.length)} reads, oldest left</span>
          </div>
          <p className="muted" style={{ fontSize: 14, margin: "4px 0 12px" }}>
            {NETWORK === "local"
              ? "On the local fork reads go straight to the node, so they take milliseconds. Through a mixnet on Base Sepolia, each read takes seconds: that is the price of nobody seeing what you watch."
              : status.direct
                ? "You chose to read directly while the anonymity networks are down, so reads take milliseconds again, but they are not private."
                : "Each read travels through an anonymity network, so it takes seconds instead of milliseconds: that is the price of nobody seeing what you watch."}
          </p>
          <ColumnChart
            items={reads.slice(0, 30).reverse().map((e) => ({ label: e.label, value: e.ms, note: `${e.method} · ${e.route === "anon-rpc" ? "via Anon-RPC" : e.route === "local-direct" ? "local node" : e.route}` }))}
            yFmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)}
            caption="Hover a column for the read it was. Every read is also listed below with its isolation key."
          />
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="spread">
          <h3>Every read, live</h3>
          <span className="faint mono" style={{ fontSize: 12 }}>newest first</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Time</th><th>Route</th><th>Method</th><th>Label</th><th>Isolation key</th><th className="num">ms</th></tr></thead>
            <tbody>
              {log.length === 0 && <tr><td colSpan={6} className="faint">No reads yet. Open the live book in another tab.</td></tr>}
              {log.slice(0, 200).map((e) => (
                <tr key={e.id} data-testid="read-row" data-route={e.route} data-key={e.isolationKey}>
                  <td className="mono faint">{new Date(e.at).toLocaleTimeString()}</td>
                  <td>
                    <span className={`tag ${e.route === "anon-rpc" ? "live" : "sim"}`}>
                      {e.route === "anon-rpc" ? `anon-rpc · ${e.worker}` : e.route === "bootstrap" ? "bootstrap (not anon)" : e.route === "direct" ? "direct (not private)" : "local direct"}
                    </span>
                  </td>
                  <td className="mono">{e.method}</td>
                  <td className="muted">{e.label}{e.note && <span className="faint"> · {e.note}</span>}</td>
                  <td className="addr faint" style={{ fontSize: 12 }}>{e.isolationKey}</td>
                  <td className={`num ${e.ok ? "" : "bad"}`}>{e.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="card more" style={{ marginTop: 16 }} open={!!PROXY}>
        <summary><h3>What the RPC server sees</h3></summary>
        {!PROXY ? (
          <p className="muted" style={{ fontSize: 14 }}>
            Run <span className="addr">proxy/server.mjs</span> and set <span className="addr">NEXT_PUBLIC_MOHUR_PROXY_URL</span> to see requests arrive from Tor exits.
          </p>
        ) : (
          <div className="table-scroll" style={{ maxHeight: 360, overflowY: "auto" }}>
            <table>
              <thead><tr><th>Time</th><th>Source IP</th><th>Tor exit?</th><th>Method</th></tr></thead>
              <tbody>
                {(proxy ?? []).map((r, i) => (
                  <tr key={i}>
                    <td className="mono faint">{new Date(r.t).toLocaleTimeString()}</td>
                    <td className="mono">{r.ip}</td>
                    <td className={r.tor ? "good" : "bad"}>{r.tor ? "yes" : "no"}</td>
                    <td className="mono">{r.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
