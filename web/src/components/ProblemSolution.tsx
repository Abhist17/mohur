import { VenueLogo } from "./VenueMark";

/** Three coin columns (ETH gold, BTC copper, USDC silver), scaled by `h` (0-1): the wallet at a glance. */
function Stack({ h = 1 }: { h?: number }) {
  return (
    <span className="ps-stack" aria-hidden="true">
      {[0.92, 0.66, 0.74].map((x, i) => (
        <span key={i} className={`ps-coin c${i}`} style={{ height: `${Math.round(54 * x * h)}px` }} />
      ))}
    </span>
  );
}

function Tag({ venue, text, tone }: { venue: 0 | 1; text: string; tone?: "bad" | "good" }) {
  return (
    <span className={`ps-tag ${tone ?? ""}`}>
      <VenueLogo venue={venue} size={14} /> {text}
    </span>
  );
}

/**
 * The question and the answer, in one picture: today a maker splits coins per venue and the two prices drift;
 * with Mohur one wallet feeds both venues at one price. `price` is the live ETH price when an index is deployed.
 */
export function ProblemSolution({ price, live }: { price: string; live: boolean }) {
  return (
    <div className="ps" data-testid="problem-solution">
      <div className="ps-col ps-today">
        <div className="ps-label">Today</div>
        <div className="ps-body">
        <div className="ps-pic">
          <div className="ps-split">
            <Stack h={0.55} />
            <Tag venue={0} text="1 ETH = 3,962" tone="bad" />
          </div>
          <div className="ps-split">
            <Stack h={0.55} />
            <Tag venue={1} text="1 ETH = 4,051" tone="bad" />
          </div>
        </div>
        <ul className="ps-list">
          <li>Coins split into a pile per venue</li>
          <li>Two prices drift apart</li>
          <li>Arbitrage drains the gap from you</li>
        </ul>
        </div>
      </div>
      <div className="ps-arrow" aria-hidden="true">↓</div>
      <div className="ps-col ps-mohur">
        <div className="ps-label gold">With Mohur</div>
        <div className="ps-body">
        <div className="ps-pic ps-one">
          <Stack />
          <span className="ps-tags">
            <Tag venue={0} text={`1 ETH = ${price}`} tone="good" />
            <Tag venue={1} text={`1 ETH = ${price}`} tone="good" />
          </span>
        </div>
        <ul className="ps-list">
          <li>One wallet; your coins never move to a pool</li>
          <li>One price on both venues: <b>0 wei apart</b></li>
          <li>Any arbitrage loop loses (<b>−0.8%</b>)</li>
        </ul>
        </div>
      </div>
      <div className="ps-note faint">
        {live ? "With Mohur prices are live from the demo index; Today prices illustrate the problem." : "Prices illustrate the idea."} 0 wei and −0.8% are measured on a Base Sepolia fork (
        <code>./scripts/demo.sh</code>).
      </div>
    </div>
  );
}
