import { asset, VENUE_LOGO } from "./VenueMark";

/**
 * The Tenbin idea in one picture: one wallet (ETH, BTC and USDC at their target weights) feeding two
 * stalls (Uniswap v4, 1inch Aqua) that show the same price tag. Used across screens so every page says
 * where it sits in the story.
 */
export function Concept({ caption, highlight }: { caption: React.ReactNode; highlight?: "uniswap" | "1inch" | "wallet" }) {
  const dim = (k: string) => (highlight && highlight !== k ? 0.45 : 1);
  return (
    <div className="concept">
      <svg viewBox="0 0 360 96" width="100%" role="img" aria-label="One wallet feeding Uniswap and 1inch at one price">
        {/* links */}
        <path d="M92 50 H148" style={{ stroke: "var(--accent-2)" }} strokeWidth="1.5" strokeDasharray="4 4" opacity={dim("uniswap")} />
        <path d="M212 50 H268" style={{ stroke: "var(--accent-2)" }} strokeWidth="1.5" strokeDasharray="4 4" opacity={dim("1inch")} />
        {/* stalls */}
        <g opacity={dim("uniswap")}>
          <rect x="4" y="30" width="88" height="40" rx="9" style={{ fill: "var(--panel)" }} stroke="#ff007a" />
          <image href={asset(VENUE_LOGO[0])} x="10" y="42" width="15" height="15" />
          <text x="29" y="47" fontSize="10.5" fill="#ff5cae" fontWeight="600">Uniswap v4</text>
          <text x="29" y="61" fontSize="9.5" style={{ fill: "var(--muted)" }}>same price</text>
        </g>
        <g opacity={dim("1inch")}>
          <rect x="268" y="30" width="88" height="40" rx="9" style={{ fill: "var(--panel)" }} stroke="#2f8af5" />
          <image href={asset(VENUE_LOGO[1])} x="274" y="42" width="15" height="15" />
          <text x="293" y="47" fontSize="10.5" fill="#6fb0ff" fontWeight="600">1inch Aqua</text>
          <text x="293" y="61" fontSize="9.5" style={{ fill: "var(--muted)" }}>same price</text>
        </g>
        {/* wallet: one card holding the three assets at their target weights */}
        <g opacity={dim("wallet")}>
          <rect x="150" y="22" width="60" height="56" rx="10" style={{ fill: "var(--panel)", stroke: "var(--accent-2)" }} strokeWidth="1.5" />
          {[["#627eea", 40], ["#f7931a", 30], ["#2775ca", 30]].map(([c, w], i) => (
            <rect key={i} x="158" y={32 + i * 12} width={(Number(w) / 40) * 44} height="7" rx="3.5" fill={c as string} />
          ))}
          <text x="180" y="91" textAnchor="middle" fontSize="10.5" style={{ fill: "var(--text)" }} fontWeight="600">your wallet</text>
        </g>
      </svg>
      <div className="concept-cap">{caption}</div>
    </div>
  );
}
