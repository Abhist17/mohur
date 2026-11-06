import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { VenueMark } from "@/components/VenueMark";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

// set the theme before first paint (saved choice, else the system setting) so there is no flash
const THEME_SCRIPT = `try{var t=localStorage.getItem("mohur-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export const metadata: Metadata = {
  title: "Mohur: one wallet, one price, every venue",
  description:
    "A self-custodial weighted index that Uniswap v4 and 1inch Aqua trade against at one oracle-free price, monitored privately through Anon-RPC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
          <footer className="foot">
            <div className="wrap foot-grid">
              <div>
                <div className="brand" style={{ fontSize: 24 }}><span className="coin-dot" /> Mohur</div>
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
                <a href="https://github.com/Abhist17/mohur" target="_blank" rel="noreferrer">Source code ↗</a>
              </div>
              <div className="foot-col">
                <b>Built on</b>
                <VenueMark venue={0} size={16} />
                <VenueMark venue={1} size={16} />
                <span>Anon-RPC</span>
              </div>
            </div>
            <div className="wrap" style={{ marginTop: 24, fontSize: 12.5 }}>Testnet demo with test tokens that have no value. Not audited.</div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
