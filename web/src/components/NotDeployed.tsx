"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NETWORK } from "@/lib/config";
import { asset } from "./VenueMark";

const SCREENS = ["swap", "explore", "book", "my", "arbitrage", "demo", "share", "launch"];
const DOC = "https://github.com/Abhist17/mohur/blob/main/docs/explained.md";

/** Shown on chain screens when this build has no contract addresses for its network. Says so plainly, shows how to
 *  run everything locally, and previews the screen with a screenshot from the automated test run (labelled as such). */
export function NotDeployed() {
  const path = usePathname() ?? "";
  const page = SCREENS.find((s) => path.replace(/\/$/, "").endsWith(`/${s}`));
  return (
    <div className="wrap page" data-testid="not-deployed">
      <div className="page-head">
        <div className="eyebrow">Not live on {NETWORK === "base-sepolia" ? "Base Sepolia" : NETWORK} yet</div>
        <h2>This screen needs the contracts</h2>
        <p>Unison&apos;s contracts aren&apos;t deployed on this network yet, so there&apos;s nothing real to show here. Everything runs on a local fork of Base Sepolia in one command.</p>
      </div>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card stack">
          <h3>Run it yourself</h3>
          <pre className="mono" style={{ margin: 0, padding: 12, background: "var(--bg-2)", borderRadius: "var(--radius-sm)", overflowX: "auto", fontSize: 13 }}>
{`git clone https://github.com/Abhist17/mohur
cd mohur && ./scripts/demo.sh`}
          </pre>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Forks Base Sepolia, deploys, launches a 40/30/30 index, trades on both venues, prints the numbers and opens this app.
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Link href="/privacy" className="btn small primary">Privacy works now</Link>
            <a href={DOC} target="_blank" rel="noreferrer" className="btn small">How it works ↗</a>
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>The Privacy page reads Base Sepolia through Anon-RPC right now; it doesn&apos;t need Unison&apos;s contracts.</p>
        </div>
        {page && (
          <figure className="card" style={{ margin: 0, padding: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset(`/screens/${page}.jpg`)} alt={`Screenshot of the ${page} screen`} width={1100}
              height={1226}
              style={{ width: "100%", height: "auto", aspectRatio: "1100 / 1226", objectFit: "cover", objectPosition: "top", borderRadius: "var(--radius-sm)", display: "block", background: "var(--bg-2)" }} />
            <figcaption className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>
              <span className="tag sim">screenshot</span> This screen in the automated browser test on a local Base Sepolia fork. Not live data.
            </figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}
