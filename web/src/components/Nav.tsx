"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { NETWORK, WORKERS } from "@/lib/config";
import { useAnon } from "./Providers";

const LINKS = [
  ["/swap", "Swap"],
  ["/book", "Live book"],
  ["/my", "My index"],
  ["/arbitrage", "Arbitrage me"],
  ["/privacy", "Privacy"],
  ["/how", "How it works"],
] as const;

export function RoutePill() {
  const { status } = useAnon();
  if (NETWORK === "local")
    return (
      <Link href="/privacy" className="pill" title="Local fork: reads go straight to the local node">
        <span className="dot warn" /> local node · direct
      </Link>
    );
  const cls = status.state === "ready" ? "ok" : status.state === "failed" ? "bad" : "warn";
  const txt =
    status.state === "ready" ? `${WORKERS[status.worker].label} · ready` : status.state === "failed" ? "anon-rpc failed" : `connecting ${WORKERS[status.worker].label}…`;
  return (
    <Link href="/privacy" className="pill" title="Every chain read goes through Anon-RPC">
      <span className={`dot ${cls}`} /> {txt}
    </Link>
  );
}

export function ConnectButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  if (w.account)
    return (
      <button className="btn small" onClick={w.disconnect} title="Disconnect">
        <span className="addr">{w.account.slice(0, 6)}…{w.account.slice(-4)}</span>
      </button>
    );
  return (
    <div style={{ position: "relative" }}>
      <button className="btn small primary" onClick={() => setOpen(!open)} disabled={w.connecting}>
        {w.connecting ? "Connecting…" : "Connect"}
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", right: 0, top: 44, width: 260, padding: 10, zIndex: 60 }}>
          <button className="btn small" style={{ width: "100%", marginBottom: 6 }} onClick={() => { setOpen(false); w.connectInjected(); }}>
            Browser wallet
          </button>
          {w.localAccounts.length > 0 && <div className="faint" style={{ fontSize: 12, margin: "8px 4px 4px" }}>Local dev accounts (fork only)</div>}
          {w.localAccounts.map((a, i) => (
            <button key={a.key} className="btn small" style={{ width: "100%", marginBottom: 6 }} onClick={() => { setOpen(false); w.connectLocal(i); }}>
              {a.label}
            </button>
          ))}
          {w.error && <div className="err">{w.error}</div>}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Link href="/" className="brand">
          <span className="coin-dot" /> Mohur
        </Link>
        <nav className="nav-links">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "on" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <RoutePill />
        <ConnectButton />
        <button className="btn small nav-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          {menu ? "✕" : "☰"}
        </button>
      </div>
      {menu && (
        <nav className="nav-mobile wrap">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "on" : ""} onClick={() => setMenu(false)}>
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
