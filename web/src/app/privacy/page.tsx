"use client";

import { useEffect, useState } from "react";
import { switchWorker } from "@/lib/anon";
import { NETWORK, WORKERS, type WorkerId } from "@/lib/config";
import { useAnon } from "@/components/Providers";

const PROXY = process.env.NEXT_PUBLIC_MOHUR_PROXY_URL;

type ProxyRow = { t: number; ip: string; tor: boolean; method: string };

export default function PrivacyPage() {
  const { log, status } = useAnon();
  const [proxy, setProxy] = useState<ProxyRow[]>();

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

  const reads = log.filter((e) => e.route !== "bootstrap");
  const anonShare = reads.length ? (reads.filter((e) => e.route === "anon-rpc").length / reads.length) * 100 : 0;
  const keys = new Map<string, number>();
  for (const e of reads) keys.set(e.isolationKey, (keys.get(e.isolationKey) ?? 0) + 1);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div className="eyebrow">Privacy</div>
        <h2>Nobody watching</h2>
        <p>
          A market-making dashboard polls the same wallet, pairs and quotes all day. Through a normal RPC that is a fingerprint tied to your IP.
          Here every chain read goes through the Ethereum Foundation&apos;s Anon-RPC, with a separate isolation key per maker, per strategy and per trader.
        </p>
      </div>

      {NETWORK === "local" && (
        <div className="banner" style={{ marginBottom: 16 }}>
          Local fork: reads go straight to your local node, because no anonymity network can reach localhost. On Base Sepolia every read below goes through Anon-RPC.
        </div>
      )}

      <div className="grid g3">
        <div className="card">
          <div className="faint" style={{ fontSize: 12 }}>READS THROUGH ANON-RPC</div>
          <div className="serif" style={{ fontSize: 56 }}>{reads.length ? anonShare.toFixed(0) : "-"}%</div>
          <div className="muted" style={{ fontSize: 13 }}>{reads.length} reads this session</div>
        </div>
        <div className="card">
          <div className="faint" style={{ fontSize: 12 }}>ISOLATION KEYS IN USE</div>
          <div className="serif" style={{ fontSize: 56 }}>{keys.size}</div>
          <div className="muted" style={{ fontSize: 13 }}>reads under different keys can&apos;t be linked</div>
        </div>
        <div className="card">
          <div className="faint" style={{ fontSize: 12 }}>WORKER</div>
          <div className="serif" style={{ fontSize: 30, marginTop: 6 }}>{WORKERS[status.worker].label}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {NETWORK === "local" ? "not used on the local fork" : status.state === "ready" ? `ready in ${(status.bootMs! / 1000).toFixed(1)} s` : status.state === "failed" ? `failed: ${status.error}` : "connecting…"}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {(Object.keys(WORKERS) as WorkerId[]).map((id) => (
              <button key={id} className={`btn small ${status.worker === id ? "primary" : ""}`} disabled={NETWORK === "local"} onClick={() => switchWorker(id).catch(() => {})}>
                {id}
              </button>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>{WORKERS[status.worker].note}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Who learns what</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Party</th><th>Plain RPC</th><th>Mohur via Anon-RPC</th></tr></thead>
            <tbody>
              <tr><td>RPC provider</td><td>Your IP + every wallet, pair and quote you poll</td><td className="good">A Tor exit (or mix exit) and the requests; not who you are</td></tr>
              <tr><td>Tor relays / gateway</td><td>-</td><td>Guard sees your IP but not the content; exit sees content but not your IP</td></tr>
              <tr><td>Anyone linking reads</td><td>One identity across everything</td><td className="good">One key per maker, per strategy, per trader: separate circuits</td></tr>
              <tr><td>Bootstrap RPC (mainnet)</td><td>-</td><td className="bad">One read of the worker specifier contract (before the anonymous client exists)</td></tr>
              <tr><td>Your wallet&apos;s RPC</td><td>Your transactions</td><td className="bad">Still your transactions: the wallet broadcasts them (excluded)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="spread">
          <h3>Every chain read, live</h3>
          <span className="faint mono" style={{ fontSize: 12 }}>newest first</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Time</th><th>Route</th><th>Method</th><th>Label</th><th>Isolation key</th><th className="num">ms</th></tr></thead>
            <tbody>
              {log.length === 0 && <tr><td colSpan={6} className="faint">No reads yet. Open the live book in another tab.</td></tr>}
              {log.slice(0, 200).map((e) => (
                <tr key={e.id}>
                  <td className="mono faint">{new Date(e.at).toLocaleTimeString()}</td>
                  <td>
                    <span className={`tag ${e.route === "anon-rpc" ? "live" : "sim"}`}>
                      {e.route === "anon-rpc" ? `anon-rpc · ${e.worker}` : e.route === "bootstrap" ? "bootstrap (not anon)" : "local direct"}
                    </span>
                  </td>
                  <td className="mono">{e.method}</td>
                  <td className="muted">{e.label}{e.note && <span className="faint"> · {e.note}</span>}</td>
                  <td className="mono faint" style={{ fontSize: 12 }}>{e.isolationKey}</td>
                  <td className={`num ${e.ok ? "" : "bad"}`}>{e.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>What the RPC server sees</h3>
        {!PROXY ? (
          <p className="muted">
            Set <span className="mono">NEXT_PUBLIC_MOHUR_PROXY_URL</span> to a running <span className="mono">proxy/server.mjs</span> to route reads through
            a logging JSON-RPC proxy and see, from the server&apos;s side, that requests arrive from Tor exits.
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
      </div>
    </div>
  );
}
