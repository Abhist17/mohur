"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { NETWORK, WORKERS } from "@/lib/config";
import { useAnon } from "./Providers";
import { allowDirect, retryPrivate } from "@/lib/anon";
import { Logo } from "@/components/Logo";

/** On the landing and docs pages the nav tells the story; inside the app it lists the screens. */
const SITE_LINKS = [
  ["/#idea", "The idea"],
  ["/#proof", "Proof"],
  ["/docs", "Docs"],
  ["/#faq", "FAQ"],
] as const;
const REPO = "https://github.com/Abhist17/tenbin";

const LINKS = [
  ["/swap", "Swap"],
  ["/explore", "Explore"],
  ["/book", "Book"],
  ["/my", "My index"],
  ["/arbitrage", "Arbitrage"],
  ["/privacy", "Privacy"],
  ["/how", "How it works"],
  ["/demo", "Demo"],
] as const;

export function RoutePill() {
  const { status } = useAnon();
  if (NETWORK === "local")
    return (
      <Link href="/privacy" className="pill" title="Local fork: reads go straight to the local node">
        <span className="dot warn" /> local node · direct
      </Link>
    );
  if (status.direct)
    return (
      <Link href="/privacy" className="pill" title="You chose to read without privacy because no anonymity network could start" data-testid="route-pill">
        <span className="dot warn" /> direct · not private
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

/** Shown only when every anonymity network failed (or the user then chose to read directly). Never decides for the user. */
export function PrivacyBanner() {
  const { status } = useAnon();
  const [busy, setBusy] = useState(false);
  const retrying = status.state === "booting" && !!status.retry;
  if (NETWORK === "local" || !(status.state === "failed" || retrying || status.direct)) return null;
  const auto = retrying || (status.state === "failed" && status.retryAt);
  if (status.direct)
    return (
      <div className="privacy-banner warn" data-testid="privacy-banner">
        <div className="wrap privacy-banner-in">
          <span>Reading directly from a public RPC: <b>not private</b>. Every read is marked that way on the Privacy page.</span>
          <button className="btn small" onClick={() => retryPrivate().catch(() => {})}>Try private again</button>
        </div>
      </div>
    );
  return (
    <div className="privacy-banner" data-testid="privacy-banner">
      <div className="wrap privacy-banner-in">
        {auto ? (
          <span data-testid="privacy-retrying">
            <b>The private route dropped. Trying again by itself</b> ({retrying ? `attempt ${status.retry} of 3` : "in a few seconds"}). Nothing is read without privacy unless you say so.
          </span>
        ) : (
          <span>
            <b>The private routes are unreachable right now</b> (Tor and Nym gateways did not answer). Tenbin never reads without them unless you say so.
          </span>
        )}
        <span className="row" style={{ gap: 8 }}>
          <button className="btn small" disabled={busy} onClick={() => { setBusy(true); retryPrivate().catch(() => {}).finally(() => setBusy(false)); }}>{busy ? "Retrying…" : "Retry"}</button>
          <button className="btn small primary" onClick={allowDirect} data-testid="allow-direct">Continue without privacy</button>
        </span>
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("tenbin-theme", next); } catch {}
    setTheme(next);
  };
  return (
    <button className="btn small theme-btn" onClick={flip} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Theme">
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}

export function Nav() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const site = path === "/" || path.startsWith("/docs");
  if (site)
    return (
      <header className="nav">
        <a href="#main" className="skip">Skip to content</a>
        <div className="wrap nav-in">
          <Link href="/" className="brand">
            <Logo size={24} /> Tenbin
          </Link>
          <nav className="nav-links nav-site" aria-label="Main">
            {SITE_LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}>
                {label}
              </Link>
            ))}
            <a href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
          <ThemeToggle />
          <Link href="/swap" className="btn small nav-open" data-testid="nav-launch">Open the app</Link>
          <button className="btn small nav-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {menu ? "✕" : "☰"}
          </button>
        </div>
        {menu && (
          <nav className="nav-mobile wrap">
            {SITE_LINKS.map(([href, label]) => (
              <Link key={href} href={href} onClick={() => setMenu(false)}>{label}</Link>
            ))}
            <a href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
            <Link href="/swap" onClick={() => setMenu(false)}>Open the app →</Link>
          </nav>
        )}
      </header>
    );
  return (
    <header className="nav">
      <a href="#main" className="skip">Skip to content</a>
      <div className="wrap nav-in">
        <Link href="/" className="brand">
          <Logo size={24} /> Tenbin
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <RoutePill />
        <ThemeToggle />
        <ConnectButton />
        <button className="btn small nav-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          {menu ? "✕" : "☰"}
        </button>
      </div>
      {menu && (
        <nav className="nav-mobile wrap">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined} onClick={() => setMenu(false)}>
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
