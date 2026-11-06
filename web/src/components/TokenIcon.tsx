import { TOKEN_STYLE } from "@/lib/mohur";

const GLYPH: Record<string, string> = { ETH: "Ξ", BTC: "₿", USDC: "$" };

/** A flat token badge in the asset's usual colour (ETH blue, BTC orange, USDC blue) with its symbol glyph. */
export function TokenIcon({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const s = TOKEN_STYLE[symbol];
  const name = s?.name ?? symbol;
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
        fontSize: size * 0.52,
        fontWeight: 700,
        lineHeight: 1,
        color: "#ffffff",
        background: s?.color ?? "#777",
      }}
    >
      {GLYPH[name] ?? name.slice(0, 1)}
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
