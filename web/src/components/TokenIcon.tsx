import { TOKEN_STYLE } from "@/lib/mohur";

/** A small metal coin with the asset's initial: gold ETH, copper BTC, silver USDC. */
export function TokenIcon({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const s = TOKEN_STYLE[symbol];
  const c = s?.color ?? "#777";
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "0 0 auto",
        display: "inline-grid",
        placeItems: "center",
        fontSize: size * 0.46,
        fontWeight: 700,
        color: "#1a1206",
        background: `radial-gradient(circle at 32% 30%, #fff8 0, ${c} 45%, #0006 120%)`,
        boxShadow: `inset 0 0 0 1.5px #0004, 0 0 0 1px ${c}55`,
      }}
    >
      {(s?.name ?? symbol).slice(0, 1)}
    </span>
  );
}

export function TokenLabel({ symbol, size }: { symbol: string; size?: number }) {
  return (
    <span className="row" style={{ gap: 8, display: "inline-flex" }}>
      <TokenIcon symbol={symbol} size={size} />
      <span>{TOKEN_STYLE[symbol]?.name ?? symbol}</span>
    </span>
  );
}
