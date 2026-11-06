import { VenueLogo } from "./VenueMark";
import { Logo } from "./Logo";

type Step = { title: string; body: string; shared?: boolean };

const FLOWS: { venue: 0 | 1; name: string; steps: Step[] }[] = [
  {
    venue: 0,
    name: "Uniswap v4",
    steps: [
      { title: "Trader swaps", body: "through any Uniswap router" },
      { title: "Hook prices it", body: "quote() over your wallet; the pool's curve is switched off", shared: true },
      { title: "Aqua pays out", body: "the coins bought leave your wallet, within Uniswap's limit" },
      { title: "Input comes home", body: "held as claims, then flushed into your wallet" },
    ],
  },
  {
    venue: 1,
    name: "1inch Aqua",
    steps: [
      { title: "Taker fills", body: "your shipped 1inch order" },
      { title: "Opcode 0xd0 prices it", body: "the same quote() over the same wallet", shared: true },
      { title: "Aqua pays out", body: "the coins bought leave your wallet, within 1inch's limit" },
      { title: "Input comes home", body: "pushed straight into your wallet" },
    ],
  },
];

/** One trade on each venue, step by step. The shared step (one quote() over one wallet) is highlighted. */
export function TradeFlow() {
  return (
    <div className="flow" data-testid="trade-flow">
      {FLOWS.map((f) => (
        <div key={f.venue} className="flow-row" aria-label={`A trade on ${f.name}`}>
          <div className="flow-venue">
            <VenueLogo venue={f.venue} size={22} />
            <b>{f.name}</b>
          </div>
          <ol className="flow-steps">
            {f.steps.map((s, i) => (
              <li key={i} className={`flow-step${s.shared ? " shared" : ""}`}>
                <span className="flow-n">{i + 1}</span>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <div className="flow-foot">
        <Logo size={20} />
        <span>Both rows read and change <b>one wallet</b>, so a trade on either venue moves the next quote on both.</span>
      </div>
    </div>
  );
}
