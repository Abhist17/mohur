/** Unison's mark: two waves (two venues) merging into one line (one price). Uses the accent colour, so it follows the theme. */
export function Logo({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} style={{ flex: "0 0 auto" }}>
      {title && <title>{title}</title>}
      <path d="M3 8.5c6 0 8.5 7.5 14.5 7.5" stroke="var(--accent-2)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M3 23.5c6 0 8.5-7.5 14.5-7.5" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M17.5 16H29" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
