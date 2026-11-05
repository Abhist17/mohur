import Link from "next/link";
import { Concept } from "@/components/Concept";

export const metadata = { title: "How Mohur works" };

const GLOSSARY: [string, string][] = [
  ["Index", "A wallet that holds several assets at fixed target shares by value, for example 40% ETH, 30% BTC, 30% USDC."],
  ["Weight", "An asset's target share of the index. The weights are the whole strategy: every price Mohur quotes keeps the wallet on them."],
  ["Venue", "A place traders can buy from you. Mohur has two: Uniswap v4 and 1inch Aqua."],
  ["Venue limit", "The most each venue may sell of each coin, tracked by 1inch Aqua (50% of each balance at launch). The wallet keeps the rest."],
  ["1inch Aqua", "A registry that lets one wallet back many strategies without moving coins. It is the only contract your wallet approves."],
  ["Hook", "A small contract Uniswap v4 calls during a swap. Mohur's hook replaces the pool's own pricing with your wallet's price."],
  ["Opcode 0xd0", "A custom instruction added to 1inch's SwapVM. It asks the same hook for the price, so 1inch quotes exactly what Uniswap quotes."],
  ["Claims", "Uniswap pays traders' input to the hook a moment after the swap. The hook holds it as ERC-6909 claims for you, counts it as yours immediately, and moves it into your wallet on the next swap (a flush)."],
  ["LVR", "Loss-versus-rebalancing: what an index gives up to the traders who move it back on target after a price change. Mohur earns fees on those trades but does not remove LVR."],
  ["Isolation key", "A label passed to Anon-RPC so reads about different things travel separately and can't be linked to one person."],
];

export default function How() {
  return (
    <div className="wrap page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div className="eyebrow">How Mohur works</div>
        <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 10 }}>One wallet. One price. Every venue.</h1>
        <p className="lead" style={{ marginTop: 16 }}>
          Mohur turns your own wallet into an index fund that two of DeFi&apos;s biggest venues trade against at the same time, from the same coins,
          at the same price, with no oracle and nobody watching you. Here is the whole idea, in plain language.
        </p>
      </div>

      <Concept caption={<><b>One stockroom, two stalls.</b> Your wallet is the stockroom. Uniswap and 1inch are two stalls selling from it. There is only one shelf, so there is only one price: a sale at either stall moves the shelf, and both price tags change together. Nothing has to be synced.</>} />

      <Section n="0" title="The idea in plain words">
        <p>
          Raju owns a shop with mangoes, rice and cash in one stockroom. He opens two stalls in two different markets: Uniswap and 1inch.
          Both stalls sell from the <b>same stockroom</b> and read prices off the <b>same board</b>, which follows one simple rule:
        </p>
        <ul className="steps">
          <li>Raju wants his stockroom to stay 40% mangoes, 30% rice, 30% cash.</li>
          <li>If he has too many mangoes, the board makes mangoes cheaper, so customers buy them and the stock goes back to 40%.</li>
          <li>If mangoes run low, the board makes them dearer, so customers sell him mangoes.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Because both stalls read one stockroom, a sale at one stall changes the price at the other immediately. Nobody can buy cheap at one
          stall and sell dear at the other against Raju, and no loop through his three products makes free money. And while Raju checks his
          stock all day, those checks go through an anonymous channel, so whoever supplies the information never learns who is asking.
        </p>
        <p>
          <b>In one sentence:</b> your wallet becomes a self-rebalancing index fund that earns trading fees on two exchanges at once, without
          your money ever leaving your wallet, and without anyone watching you run it.
        </p>
      </Section>

      <Section n="1" title="The problem today">
        To make markets on two venues you split your coins into two piles. Each pile quotes its own price, drifts on its own, and needs its own
        rebalancing. Your capital is fragmented and your prices disagree. If you just hold an index, keeping it at 40/30/30 means rebalancing
        by hand and paying fees to do it. And a dashboard that watches all this polls the same wallet all day through an RPC that sees your IP.
      </Section>

      <Section n="2" title="One price, from what the wallet actually holds">
        <p>Every quote, on both venues, comes from one formula over your wallet&apos;s real balances:</p>
        <div className="formula">
          price of A in B = (weight A ÷ weight B) × (balance B ÷ balance A)
        </div>
        <p>
          Example: the wallet holds 10 ETH and 30,000 USDC with weights 40% and 30%. The price of ETH is (0.4 ÷ 0.3) × (30,000 ÷ 10) ={" "}
          <b>4,000 USDC</b>. No oracle: the price is whatever keeps your wallet on its weights. A trade moves the balances, so it moves the
          price, on both venues at once. Each trade also pays a flat 0.30% fee that stays in your wallet.
        </p>
      </Section>

      <Section n="3" title="What happens when someone trades">
        <div className="grid g2" style={{ marginTop: 4 }}>
          <div className="card">
            <h3 style={{ color: "#ff5cae" }}>On Uniswap v4</h3>
            <ol className="steps">
              <li>A trader swaps through any Uniswap router.</li>
              <li>Mohur&apos;s hook prices the trade from your wallet and switches the pool&apos;s own curve off.</li>
              <li>The coins they buy are pulled from your wallet through Aqua.</li>
              <li>What they pay is held for you as claims, then moved into your wallet.</li>
            </ol>
          </div>
          <div className="card">
            <h3 style={{ color: "#6fb0ff" }}>On 1inch Aqua</h3>
            <ol className="steps">
              <li>A trader fills your 1inch order.</li>
              <li>Instruction 0xd0 asks the same hook for the price.</li>
              <li>What they pay is pushed straight into your wallet.</li>
              <li>The coins they buy are pulled from your wallet through Aqua.</li>
            </ol>
          </div>
        </div>
        <p style={{ marginTop: 12 }}>Your wallet approves exactly one contract, Aqua, which gives each venue its own selling limit. Neither venue can touch your coins directly.</p>
      </Section>

      <Section n="4" title="It can't be gamed">
        Without fees, every trade keeps the wallet&apos;s value (by its own prices) constant, so a loop back to where you started returns exactly
        what went in. Fees only add to the wallet, and every rounding step favours you, so any loop, on one venue or bouncing between both,
        loses money. In the tests a 0.1 ETH loop ETH → USDC (Uniswap) → BTC (1inch) → ETH (Uniswap) loses 0.88%.{" "}
        <Link href="/arbitrage" className="gold">Try it yourself →</Link>
      </Section>

      <Section n="5" title="It rebalances itself">
        When ETH rises outside, your ETH is briefly cheap at Mohur. Traders buy it from you until your price matches the market, and that is
        exactly when each holding is back to its target share. In the tests, after ETH moved from $4,000 to $5,000, arbitrage alone brought
        the wallet back to 40.0 / 30.0 / 30.0. You earn the fee on every one of those trades.
      </Section>

      <Section n="6" title="Nobody watching">
        Every chain read the app makes goes through the Ethereum Foundation&apos;s Anon-RPC (over Tor, or the Nym mixnet), with a separate isolation
        key for each strategy, each maker and each trader, so the RPC sees an exit node, not you, and can&apos;t stitch your activity together.
        Two things are honestly excluded: one bootstrap read that locates the anonymous client, and your transactions, which your wallet sends.{" "}
        <Link href="/privacy" className="gold">Watch every read →</Link>
      </Section>

      <Section n="7" title="Honest limits">
        <ul className="steps">
          <li>Mohur doesn&apos;t remove LVR: the traders who rebalance you capture the move; you earn the fee.</li>
          <li>One trade can move at most 30% of a balance, and each venue sells only up to its limit.</li>
          <li>Uniswap input waits as claims until the next swap or a flush. It&apos;s priced in at once, but 1inch can only sell what&apos;s already in the wallet.</li>
          <li>Use a dedicated maker wallet. Prices come from what the wallet holds, so spending the index tokens elsewhere moves the price (and gifting tokens to it only enriches the maker).</li>
          <li>This is a testnet demo with test tokens. Not audited.</li>
        </ul>
      </Section>

      <Section n="8" title="Glossary">
        <dl className="gloss">
          {GLOSSARY.map(([t, d]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section n="9" title="Why “Mohur”">
        The mohur was the gold coin of the Mughal empire: one coin, good at every market in the land. Mohur does the same for your wallet: one
        set of coins, one price, accepted at every venue.
      </Section>

      <div className="row" style={{ marginTop: 32 }}>
        <Link href="/swap" className="btn primary">Start trading</Link>
        <Link href="/create" className="btn">Launch your own index</Link>
        <Link href="/book" className="btn">See the live book</Link>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="how-sec">
      <div className="how-n">{n}</div>
      <div>
        <h2 style={{ fontSize: 30, marginBottom: 10 }}>{title}</h2>
        <div className="how-body">{children}</div>
      </div>
    </section>
  );
}
