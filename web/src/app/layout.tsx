import type { Metadata } from "next";
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
            <div className="wrap spread">
              <span>Mohur, named for the Mughal gold coin. Testnet demo with test tokens that have no value.</span>
              <span className="mono">Uniswap v4 · 1inch Aqua · Anon-RPC</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
