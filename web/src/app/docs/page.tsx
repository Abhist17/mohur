"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { deployment, EXPLORER, NETWORK } from "@/lib/config";

const REPO = "https://github.com/Abhist17/mohur";

/** A code block with a copy button. */
function Code({ children, lang }: { children: string; lang?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {}
  };
  return (
    <div className="doc-code">
      <div className="doc-code-bar">
        <span>{lang ?? "bash"}</span>
        <button onClick={copy} className="doc-copy" aria-label="Copy code">{done ? "Copied" : "Copy"}</button>
      </div>
      <pre><code>{children}</code></pre>
    </div>
  );
}

function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="doc-sec">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const TOC: [string, string][] = [
  ["overview", "Overview"],
  ["quickstart", "Quickstart"],
  ["app", "Run the app"],
  ["deploy", "Deploy to Base Sepolia"],
  ["launch", "Launch an index"],
  ["quote", "Quote both venues"],
  ["trade", "Trade"],
  ["private", "Read privately"],
  ["contracts", "Contracts and addresses"],
  ["test", "Test everything"],
  ["limits", "Limits"],
];

export default function Docs() {
  const d = deployment();
  const rows: [string, string, string | undefined][] = [
    ["MohurHookFactory", "Deploys one hook per maker (CREATE2, v4 permission bits)", d?.hookFactory],
    ["MohurLens", "Read helper: the whole book, quotes on both venues, route quotes, previews", d?.lens],
    ["MohurLoopRouter", "One call for multi-leg trades across both venues", d?.loopRouter],
    ["MohurSwapVMRouter", "Official 1inch AquaSwapVMRouter plus opcode 0xd0", d?.swapVM],
    ["Aqua", "1inch Aqua (venue limits; the wallet's only approval)", d?.aqua],
    ["PoolManager", "Uniswap v4 (official deployment)", d?.poolManager],
    ["Demo index (hook)", "A live 40/30/30 index to trade against", d?.demoHook],
  ];
  return (
    <div className="wrap page doc">
      <aside className="doc-toc" aria-label="On this page">
        <div className="eyebrow">Docs</div>
        {TOC.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
        <a href={REPO} target="_blank" rel="noreferrer" className="accent">GitHub ↗</a>
      </aside>

      <article className="doc-body" data-testid="docs">
        <div className="page-head" style={{ marginBottom: 8 }}>
          <div className="eyebrow">Developer docs</div>
          <h1 style={{ fontSize: "clamp(34px, 4.4vw, 52px)" }}>Build with Unison</h1>
          <p>Everything you need to run Unison, launch your own index, and quote or trade it from your own product.</p>
        </div>

        <Sec id="overview" title="Overview">
          <p>
            Unison turns one wallet into a weighted index (for example 40% ETH, 30% BTC, 30% USDC) that two venues trade at once:
            Uniswap v4 through a custom-curve hook, and 1inch Aqua through a custom SwapVM instruction (opcode <code>0xd0</code>).
            Both call the same <code>quote()</code> over the wallet&apos;s real balances, so their prices are identical and any arbitrage loop loses.
          </p>
          <ul>
            <li><b>Makers</b> launch an index from their own wallet and choose how much each venue may sell.</li>
            <li><b>Traders</b> trade it on either venue with any Uniswap v4 router, a 1inch SwapVM order, or one call to <code>MohurLoopRouter</code>.</li>
            <li><b>Apps</b> read the whole book in one call through <code>MohurLens</code>, privately through Anon-RPC if they want.</li>
          </ul>
          <p className="faint" style={{ fontSize: 13.5 }}>The contracts keep the project&apos;s first name (<code>Mohur*</code>); the product is Unison. The plain-words explainer with diagrams is <a className="accent" href={`${REPO}/blob/main/docs/explained.md`} target="_blank" rel="noreferrer">docs/explained.md ↗</a>.</p>
        </Sec>

        <Sec id="quickstart" title="Quickstart">
          <p>Needs <a className="accent" href="https://book.getfoundry.sh/getting-started/installation" target="_blank" rel="noreferrer">Foundry ↗</a> and Node 22. About 5 minutes on a first run.</p>
          <Code>{`git clone --recursive ${REPO}
cd mohur
(cd contracts && npm ci) && (cd web && npm ci)
./scripts/demo.sh`}</Code>
          <p>
            <code>demo.sh</code> forks Base Sepolia (with the real Uniswap v4 PoolManager), deploys everything, launches a 40/30/30 index, trades on both
            venues, prints the numbers (0 wei apart; the loop loses) and opens this app on <code>localhost:3000</code>. Connect <b>Dev #2 (trader)</b> to trade.
          </p>
        </Sec>

        <Sec id="app" title="Run the app">
          <Code>{`# against the local fork that demo.sh started
cd web && npm run dev

# against Base Sepolia (every read goes through Anon-RPC)
NEXT_PUBLIC_MOHUR_NETWORK=base-sepolia npm run dev`}</Code>
          <p>Addresses come from <code>contracts/deployments/&lt;network&gt;.json</code>; <code>npm run sync</code> copies them and the ABIs into the app.</p>
        </Sec>

        <Sec id="deploy" title="Deploy to Base Sepolia">
          <Code>{`./scripts/setup-deployer.sh        # fresh testnet wallet, encrypted; you choose the password
# fund the printed address with >= 0.005 Base Sepolia ETH (the deploy uses ~0.0002)
./scripts/deploy-base-sepolia.sh   # deploy, launch the demo index, demo trades, 36 on-chain checks`}</Code>
          <p>It is resumable: run it again and finished steps are skipped. Already have a testnet key? <code>cast wallet import mohur-deployer --interactive</code>.</p>
        </Sec>

        <Sec id="launch" title="Launch an index">
          <p>The easiest way is the app: <Link className="accent" href="/create">Create</Link> → <Link className="accent" href="/launch">Launch</Link> walks a wallet through six transactions and resumes after a reload. The same steps from code:</p>
          <ol>
            <li><code>MohurHookFactory.deploy(salt)</code>: your hook, at an address with Uniswap v4&apos;s permission bits (mine the salt with <code>HookMiner</code>, or in the browser like the app does).</li>
            <li><code>token.approve(aqua, max)</code> for each token: the wallet&apos;s only approval.</li>
            <li><code>hook.setIndex(tokens, weights, fee)</code>: weights in 1e18 (40% = <code>0.4e18</code>), fee <code>0.003e18</code>.</li>
            <li><code>PoolManager.initialize(key, SQRT_PRICE_1_1)</code> for each pair, with the key below.</li>
            <li><code>aqua.ship(hook, hook.strategy(nonce), tokens, limits)</code>: what Uniswap may sell.</li>
            <li><code>aqua.ship(swapVM, strategy, [a, b], limits)</code> per pair, with the order from <code>MohurLens.activeAquaOrder(hook, a, b)</code>: what 1inch may sell.</li>
          </ol>
          <Code lang="solidity">{`PoolKey({
  currency0: min(a, b), currency1: max(a, b),
  fee: 0,              // the hook charges the 0.30% itself
  tickSpacing: 60,
  hooks: IHooks(hook)
})`}</Code>
        </Sec>

        <Sec id="quote" title="Quote both venues">
          <p>One <code>eth_call</code> returns both venues&apos; quotes and whether each venue can fill it (venue limit, 30% per-trade cap).</p>
          <Code lang="ts">{`import { createPublicClient, http, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { MohurLensAbi } from "./abis"; // web/src/generated/abis.ts

const client = createPublicClient({ chain: baseSepolia, transport: http() });
const { result } = await client.simulateContract({
  address: LENS, abi: MohurLensAbi, functionName: "quoteBoth",
  args: [HOOK, SWAP_VM, WETH, USDC, parseUnits("0.1", 18), true], // exact in
});
const [v4In, v4Out, v4Ok, aquaIn, aquaOut, aquaOk] = result; // v4Out === aquaOut`}</Code>
          <p><code>MohurLens.book(hook, swapVM)</code> returns every token&apos;s weight, balance, pending claims and both venue limits; <code>quoteRoute</code> quotes a multi-leg route exactly.</p>
        </Sec>

        <Sec id="trade" title="Trade">
          <p><b>Simplest:</b> one call that works on either venue, or several legs across both.</p>
          <Code lang="solidity">{`token.approve(loopRouter, amountIn);
MohurLoopRouter(loopRouter).execute(
  hook,
  [USDC, WETH],   // path
  [0],            // venue per leg: 0 = Uniswap v4, 1 = 1inch Aqua
  amountIn, minOut, recipient
);`}</Code>
          <ul>
            <li><b>Uniswap v4:</b> any v4 router (Universal Router, or your own) with the pool key above. The official V4Quoter returns exactly the hook&apos;s quote.</li>
            <li><b>1inch Aqua:</b> <code>swapVM.swap(order, amount, takerData)</code> with the order from <code>MohurLens.activeAquaOrder</code>.</li>
          </ul>
        </Sec>

        <Sec id="private" title="Read privately">
          <p>
            The app sends every chain read through the Ethereum Foundation&apos;s Anon-RPC (Tor, falling back to Nym), with a separate isolation key
            per maker, pair and trader. Reuse its transport: <code>web/src/lib/anon.ts</code> exports <code>readClient(label, key)</code>, a viem client whose
            reads are anonymised and logged for the <Link className="accent" href="/privacy">Privacy</Link> page.
          </p>
          <Code lang="ts">{`import { keys, readClient } from "@/lib/anon";
const c = readClient("my index", keys.maker(myAddress));
const book = await c.readContract({ address: LENS, abi: MohurLensAbi, functionName: "book", args: [HOOK, SWAP_VM] });`}</Code>
        </Sec>

        <Sec id="contracts" title="Contracts and addresses">
          <p>
            {d ? <>Deployed on <b>{NETWORK === "base-sepolia" ? "Base Sepolia" : "the local fork"}</b> for this build.</> : <>Not deployed on {NETWORK === "base-sepolia" ? "Base Sepolia" : NETWORK} yet for this build; run the deploy above, or the quickstart locally.</>}{" "}
            Source: <a className="accent" href={`${REPO}/tree/main/contracts/src`} target="_blank" rel="noreferrer">contracts/src ↗</a>.
          </p>
          <div className="table-scroll">
            <table data-testid="docs-contracts">
              <thead><tr><th>Contract</th><th>What it does</th><th>Address</th></tr></thead>
              <tbody>
                {rows.map(([n, what, a]) => (
                  <tr key={n}>
                    <td><code>{n}</code></td>
                    <td className="muted">{what}</td>
                    <td className="addr">{a ? (EXPLORER ? <a className="accent" href={`${EXPLORER}/address/${a}`} target="_blank" rel="noreferrer">{a.slice(0, 8)}…{a.slice(-6)} ↗</a> : `${a.slice(0, 8)}…${a.slice(-6)}`) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        <Sec id="test" title="Test everything">
          <Code>{`./scripts/check-all.sh   # contracts (incl. fork tests), typecheck + lint, fresh fork + deploy,
                         # 36 on-chain checks, 27 user flows, the browser suite (~6 min)
cd contracts && forge test           # 59 tests: unit, fuzz, invariants, audit PoC, gas, fork
cd web && npm run e2e                # every screen in real Chrome on a fresh fork
cd web && npm run e2e:testnet        # the deployed site: reads really go through Anon-RPC`}</Code>
        </Sec>

        <Sec id="limits" title="Limits">
          <ul>
            <li>Unison does not reduce LVR: traders who rebalance you capture the market move; you earn the 0.30% fee.</li>
            <li>One trade can move at most 30% of a balance; each venue sells only up to its limit.</li>
            <li>Uniswap input waits as claims until the next swap or a <code>flush()</code>; it is priced in at once.</li>
            <li>Use a dedicated wallet: quotes read its live balances.</li>
            <li>Testnet only. Not externally audited; see <a className="accent" href={`${REPO}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer">AUDIT.md ↗</a>.</li>
          </ul>
        </Sec>
      </article>
    </div>
  );
}
