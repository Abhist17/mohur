/** Venue badge: the venue's own logo + name. 0 = Uniswap v4, 1 = 1inch Aqua. */
export const VENUE_LOGO = ["/venues/uniswap.webp", "/venues/1inch.avif"] as const;
export const VENUE_NAME = ["Uniswap v4", "1inch Aqua"] as const;
export const asset = (p: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${p}`;

export function VenueLogo({ venue, size = 18 }: { venue: 0 | 1; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset(VENUE_LOGO[venue])}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", flex: "0 0 auto", borderRadius: 4, verticalAlign: "middle" }}
    />
  );
}

export function VenueMark({ venue, size = 18, short = false }: { venue: 0 | 1; size?: number; short?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <VenueLogo venue={venue} size={size} />
      {short ? (venue === 0 ? "Uniswap" : "1inch") : VENUE_NAME[venue]}
    </span>
  );
}

export const venueIndex = (name: string): 0 | 1 => (name.startsWith("1inch") ? 1 : 0);

/** Anon-RPC (Ethereum Foundation) mark: the Ethereum glyph, drawn inline so it follows the theme. */
export function AnonMark({ size = 16, label = "Anon-RPC" }: { size?: number; label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <svg width={size} height={size} viewBox="0 0 256 417" aria-hidden="true" style={{ flex: "0 0 auto" }}>
        <path fill="currentColor" opacity=".6" d="M127.96 0 125.17 9.5v275.67l2.79 2.79 127.96-75.64z" />
        <path fill="currentColor" d="M127.96 0 0 212.32l127.96 75.64V154.16z" />
        <path fill="currentColor" opacity=".6" d="m127.96 312.19-1.58 1.92v98.2l1.58 4.6L256 236.59z" />
        <path fill="currentColor" d="M127.96 416.91v-104.72L0 236.59z" />
        <path fill="currentColor" opacity=".35" d="m127.96 287.96 127.96-75.64-127.96-58.16z" />
        <path fill="currentColor" opacity=".7" d="m0 212.32 127.96 75.64V154.16z" />
      </svg>
      {label}
    </span>
  );
}
