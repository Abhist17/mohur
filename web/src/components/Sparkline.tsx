/** A tiny trend line (no axes): the shape of a series at a glance, last point marked. Pure SVG, theme colours. */
export function Sparkline({ points, width = 120, height = 32, label }: { points: number[]; width?: number; height?: number; label: string }) {
  if (points.length < 2) return <span className="faint" style={{ fontSize: 12 }}>no fills yet</span>;
  const lo = Math.min(...points), hi = Math.max(...points);
  const pad = 3;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => (hi === lo ? height / 2 : pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2));
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="spark">
      <path d={d} fill="none" stroke="var(--c-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last)} r={3.5} fill="var(--c-1)" className="chart-ring" />
    </svg>
  );
}
