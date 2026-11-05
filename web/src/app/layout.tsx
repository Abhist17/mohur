import type { Metadata } from "next";
import Link from "next/link";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Mohur: one wallet, one price, every venue",
  description:
    "A self-custodial weighted index that Uniswap v4 and 1inch Aqua trade against at one oracle-free price, monitored privately through Anon-RPC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
          <footer className="foot">
            <div className="wrap foot-grid">
              <div>
                <div className="brand" style={{ fontSize: 24 }}><span className="coin-dot" /> Mohur</div>
                <p style={{ marginTop: 10, maxWidth: 380 }}>
                  Named for the Mughal gold coin that was good at every market. One wallet, one price, every venue, nobody watching.
                </p>
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
                <span>Uniswap v4</span>
                <span>1inch Aqua</span>
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
