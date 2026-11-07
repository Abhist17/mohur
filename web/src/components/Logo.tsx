/** Tenbin's mark: a balance beam held level over two pans (two venues, one price). Uses the accent colours, so it follows the theme. */
export function Logo({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} style={{ flex: "0 0 auto" }}>
      {title && <title>{title}</title>}
      {/* post and base */}
      <path d="M16 8v18M10.5 27h11" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
      {/* the level beam */}
      <path d="M4.5 9h23" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="6.2" r="1.9" fill="var(--accent)" />
      {/* strings and two pans: the two venues, at the same height */}
      <path d="M6.5 9.5l-3 8M6.5 9.5l3 8M25.5 9.5l-3 8M25.5 9.5l3 8" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.2 17.5h8.6a4.3 4.3 0 0 1-8.6 0zM21.2 17.5h8.6a4.3 4.3 0 0 1-8.6 0z" fill="var(--accent-2)" />
    </svg>
  );
}
