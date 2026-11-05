/**
 * The Mohur idea in one picture: one wallet (the stockroom: gold ETH, copper BTC, silver USDC) feeding two
 * stalls (Uniswap v4, 1inch Aqua) that show the same price tag. Used across screens so every page says
 * where it sits in the story.
 */
export function Concept({ caption, highlight }: { caption: React.ReactNode; highlight?: "uniswap" | "1inch" | "wallet" }) {
  const dim = (k: string) => (highlight && highlight !== k ? 0.45 : 1);
  return (
    <div className="concept">
      <svg viewBox="0 0 360 96" width="100%" role="img" aria-label="One wallet feeding Uniswap and 1inch at one price">
        <defs>
          <linearGradient id="cg" x1="0" x2="1"><stop offset="0" stopColor="#f3cf7a" /><stop offset="1" stopColor="#b98426" /></linearGradient>
          <linearGradient id="cc" x1="0" x2="1"><stop offset="0" stopColor="#e09a6b" /><stop offset="1" stopColor="#9a5530" /></linearGradient>
          <linearGradient id="cs" x1="0" x2="1"><stop offset="0" stopColor="#e3e7ec" /><stop offset="1" stopColor="#8b939c" /></linearGradient>
        </defs>
        {/* links */}
        <path d="M92 50 H148" stroke="#d9a441" strokeWidth="1.5" strokeDasharray="4 4" opacity={dim("uniswap")} />
        <path d="M212 50 H268" stroke="#d9a441" strokeWidth="1.5" strokeDasharray="4 4" opacity={dim("1inch")} />
        {/* stalls */}
        <g opacity={dim("uniswap")}>
          <rect x="4" y="30" width="88" height="40" rx="9" fill="#1d1915" stroke="#ff007a" />
          <text x="48" y="47" textAnchor="middle" fontSize="11" fill="#ff5cae" fontWeight="600">Uniswap v4</text>
          <text x="48" y="62" textAnchor="middle" fontSize="10" fill="#b3a998">same price</text>
        </g>
        <g opacity={dim("1inch")}>
          <rect x="268" y="30" width="88" height="40" rx="9" fill="#1d1915" stroke="#2f8af5" />
          <text x="312" y="47" textAnchor="middle" fontSize="11" fill="#6fb0ff" fontWeight="600">1inch Aqua</text>
          <text x="312" y="62" textAnchor="middle" fontSize="10" fill="#b3a998">same price</text>
        </g>
        {/* wallet: three coin stacks */}
        <g opacity={dim("wallet")}>
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={"g" + i} x="156" y={66 - i * 7} width="14" height="6" rx="3" fill="url(#cg)" />)}
          {[0, 1, 2, 3].map((i) => <rect key={"c" + i} x="173" y={66 - i * 7} width="14" height="6" rx="3" fill="url(#cc)" />)}
          {[0, 1, 2, 3].map((i) => <rect key={"s" + i} x="190" y={66 - i * 7} width="14" height="6" rx="3" fill="url(#cs)" />)}
          <text x="180" y="88" textAnchor="middle" fontSize="10.5" fill="#f1ebe0" fontWeight="600">your wallet</text>
        </g>
      </svg>
      <div className="concept-cap">{caption}</div>
    </div>
  );
}
