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
