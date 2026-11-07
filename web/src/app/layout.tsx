import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav, PrivacyBanner } from "@/components/Nav";
import { AnonMark, VenueMark } from "@/components/VenueMark";
import { Logo } from "@/components/Logo";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });

// set the theme before first paint (saved choice, else the system setting) so there is no flash
const THEME_SCRIPT = `try{var t=localStorage.getItem("tenbin-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DESCRIPTION =
  "A self-custodial weighted index that Uniswap v4 and 1inch Aqua trade against at one oracle-free price, monitored privately through Anon-RPC.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE ? "https://abhist17.github.io" : "http://localhost:3000"),
  title: "Tenbin: one wallet, one price, every venue",
  description: DESCRIPTION,
  openGraph: {
    title: "Tenbin: one wallet, one price, every venue",
    description: DESCRIPTION,
    images: [{ url: `${BASE}/og.png`, width: 1200, height: 630, alt: "Tenbin: stop splitting your coins across exchanges. One wallet, Uniswap v4 and 1inch Aqua, 0 wei apart." }],
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Tenbin", description: DESCRIPTION, images: [`${BASE}/og.png`] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Nav />
          <PrivacyBanner />
          <main id="main" tabIndex={-1}>{children}</main>
          <footer className="foot">
            <div className="wrap foot-grid">
              <div>
                <div className="brand" style={{ fontSize: 24 }}><Logo size={26} /> Tenbin</div>
                <p style={{ marginTop: 10, maxWidth: 340 }}>One wallet, one price, every venue, nobody watching.</p>
              </div>
              <div className="foot-col">
                <b>Product</b>
                <Link href="/swap">Swap</Link>
                <Link href="/book">Live book</Link>
                <Link href="/my">My index</Link>
                <Link href="/create">Launch an index</Link>
                <Link href="/arbitrage">Arbitrage me</Link>
              </div>
              <div className="foot-col">
                <b>Learn</b>
                <Link href="/how">How it works</Link>
                <Link href="/privacy">Privacy</Link>
                <Link href="/docs">Docs</Link>
                <a href="https://github.com/Abhist17/tenbin" target="_blank" rel="noreferrer">Source code ↗</a>
              </div>
              <div className="foot-col">
                <b>Built on</b>
                <VenueMark venue={0} size={16} />
                <VenueMark venue={1} size={16} />
                <AnonMark label="Anon-RPC · Ethereum Foundation" />
              </div>
            </div>
            <div className="wrap" style={{ marginTop: 24, fontSize: 12.5 }}>Testnet demo with test tokens that have no value. Not externally audited.</div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
