"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Small SVG charts in the app's own style (no chart library):
 * 2px lines, hairline solid grid, clean ticks, a crosshair tooltip listing every series, a legend for 2+ series,
 * optional end labels, and a table view, so no value is hover-only. Colours are CSS variables, so both themes work.
 */

/** `under`: draw as a wide soft band beneath the others, so an identical line on top stays visible (e.g. two venues, one price). */
export type Series = { name: string; color: string; points: (number | null)[]; endLabel?: boolean; under?: boolean; dots?: boolean; line?: boolean };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Round, human tick values covering [lo, hi]. */
function ticks(lo: number, hi: number, n = 4) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export function LineChart({
  x,
  series,
  xFmt = (v) => String(v),
  yFmt = (v) => String(v),
  xLabel,
  yLabel,
  height = 240,
  area = false,
  zeroLine = false,
  caption,
  testId,
}: {
  x: number[];
  series: Series[];
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  area?: boolean;
  zeroLine?: boolean;
  caption?: string;
  testId?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const ends = series.some((s) => s.endLabel);
  const m = { l: 56, r: ends ? 72 : 16, t: 12, b: xLabel ? 44 : 28 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;

  const { y0, y1, yt } = useMemo(() => {
    const vals = series.flatMap((s) => s.points.filter((v): v is number => v !== null && Number.isFinite(v)));
    if (zeroLine) vals.push(0);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (!vals.length) { lo = 0; hi = 1; }
    if (hi === lo) { hi += Math.abs(hi) * 0.05 || 1; lo -= Math.abs(lo) * 0.05 || 1; }
    const pad = (hi - lo) * 0.08;
    const t = ticks(lo - pad, hi + pad);
    return { y0: Math.min(t[0], lo - pad), y1: Math.max(t[t.length - 1], hi + pad), yt: t };
  }, [series, zeroLine]);
  const x0 = x[0] ?? 0, x1 = x[x.length - 1] ?? 1;
  const sx = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * iw;
  const sy = (v: number) => m.t + (1 - (v - y0) / (y1 - y0 || 1)) * ih;
  const xt = ticks(x0, x1, Math.max(2, Math.min(6, Math.floor(iw / 90))));

  const path = (pts: (number | null)[]) => {
    let d = "", pen = false;
    pts.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? "L" : "M"}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left + m.l;
    let best = 0;
    x.forEach((v, i) => { if (Math.abs(sx(v) - px) < Math.abs(sx(x[best]) - px)) best = i; });
    setHover(best);
  };

  const tipLeft = hover !== undefined ? Math.min(Math.max(sx(x[hover]) + 10, 8), width - 190) : 0;

  return (
    <figure className="chart" data-testid={testId}>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.name}><span className="chart-key" style={{ background: s.color, height: s.under ? 7 : 3, opacity: s.under ? 0.5 : 1 }} />{s.name}</span>
          ))}
        </div>
      )}
      {yLabel && <div className="chart-axis-y">{yLabel}</div>}
      <div ref={ref} className="chart-box">
        <svg width={width} height={height} role="img" aria-label={caption ?? `${series.map((s) => s.name).join(", ")} by ${xLabel ?? "x"}`}>
          {/* grid + y ticks */}
          {yt.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} className="chart-grid" />
              <text x={m.l - 8} y={sy(v)} className="chart-tick" textAnchor="end" dominantBaseline="middle">{yFmt(v)}</text>
            </g>
          ))}
          {zeroLine && y0 < 0 && y1 > 0 && <line x1={m.l} x2={width - m.r} y1={sy(0)} y2={sy(0)} className="chart-zero" />}
          {/* x ticks */}
          {xt.map((v) => (
            <text key={v} x={sx(v)} y={m.t + ih + 18} className="chart-tick" textAnchor="middle">{xFmt(v)}</text>
          ))}
          {xLabel && <text x={m.l + iw / 2} y={height - 6} className="chart-axis" textAnchor="middle">{xLabel}</text>}
          {/* series */}
          {series.map((s) => (
            <g key={s.name}>
              {area && series.length === 1 && (
                <path d={`${path(s.points)}L${sx(x1)},${sy(Math.max(y0, 0))}L${sx(x0)},${sy(Math.max(y0, 0))}Z`} fill={s.color} opacity={0.1} />
              )}
              {s.line !== false && <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.under ? 7 : 2} strokeOpacity={s.under ? 0.35 : 1} strokeLinejoin="round" strokeLinecap="round" />}
              {s.dots && s.points.map((v, i) => (v === null || !Number.isFinite(v) ? null : <circle key={i} cx={sx(x[i])} cy={sy(v)} r={4.5} fill={s.color} className="chart-ring" />))}
            </g>
          ))}
          {/* end dots + end labels */}
          {series.map((s) => {
            const i = s.points.map((v, k) => (v === null ? -1 : k)).filter((k) => k >= 0).pop();
            if (i === undefined) return null;
            const v = s.points[i] as number;
            return (
              <g key={s.name + "-end"}>
                <circle cx={sx(x[i])} cy={sy(v)} r={4} fill={s.color} className="chart-ring" />
                {s.endLabel && <text x={sx(x[i]) + 8} y={sy(v)} className="chart-end" dominantBaseline="middle">{s.name}</text>}
              </g>
            );
          })}
          {/* crosshair */}
          {hover !== undefined && (
            <g>
              <line x1={sx(x[hover])} x2={sx(x[hover])} y1={m.t} y2={m.t + ih} className="chart-cross" />
              {series.map((s) => {
                const v = s.points[hover];
                return v === null || !Number.isFinite(v) ? null : <circle key={s.name} cx={sx(x[hover])} cy={sy(v)} r={4} fill={s.color} className="chart-ring" />;
              })}
            </g>
          )}
          <rect x={m.l} y={m.t} width={Math.max(iw, 1)} height={Math.max(ih, 1)} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(undefined)} />
        </svg>
        {hover !== undefined && (
          <div className="chart-tip" style={{ left: tipLeft, top: 8 }} role="status">
            <div className="faint">{xLabel ? `${xLabel}: ` : ""}{xFmt(x[hover])}</div>
            {series.map((s) => (
              <div key={s.name} className="chart-tip-row">
                <span className="chart-key line" style={{ background: s.color }} />
                <b>{s.points[hover] === null ? "–" : yFmt(s.points[hover] as number)}</b>
                <span className="faint">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {caption && <figcaption className="chart-cap">{caption}</figcaption>}
      <details className="chart-table">
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{xLabel ?? "x"}</th>{series.map((s) => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
            <tbody>
              {x.map((v, i) => (
                <tr key={i}><td>{xFmt(v)}</td>{series.map((s) => <td key={s.name} className="num">{s.points[i] === null ? "–" : yFmt(s.points[i] as number)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Columns for a short list of values (≤ 24px wide, 4px rounded tops), each with its own hover tooltip. */
export function ColumnChart({
  items,
  color = "var(--c-1)",
  yFmt = (v) => String(v),
  height = 180,
  caption,
  testId,
}: {
  items: { label: string; value: number; note?: string }[];
  color?: string;
  yFmt?: (v: number) => string;
  height?: number;
  caption?: string;
  testId?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const m = { l: 48, r: 12, t: 10, b: 12 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  const max = Math.max(1, ...items.map((i) => i.value));
  const yt = ticks(0, max * 1.12, 3);
  const top = Math.max(max * 1.12, yt[yt.length - 1]);
  const slot = iw / Math.max(1, items.length);
  const bw = Math.min(24, Math.max(3, slot - 2));
  const sy = (v: number) => m.t + (1 - v / top) * ih;
  return (
    <figure className="chart" data-testid={testId}>
      <div ref={ref} className="chart-box">
        <svg width={width} height={height} role="img" aria-label={caption ?? "columns"}>
          {yt.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} className="chart-grid" />
              <text x={m.l - 8} y={sy(v)} className="chart-tick" textAnchor="end" dominantBaseline="middle">{yFmt(v)}</text>
            </g>
          ))}
          {items.map((it, i) => {
            const x = m.l + i * slot + (slot - bw) / 2, y = sy(it.value), h = Math.max(1, m.t + ih - y), r = Math.min(4, bw / 2, h);
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(undefined)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(undefined)}>
                <rect x={m.l + i * slot} y={m.t} width={slot} height={ih} fill="transparent" />
                <path d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`} fill={color} opacity={hover === undefined || hover === i ? 1 : 0.55} />
              </g>
            );
          })}
        </svg>
        {hover !== undefined && items[hover] && (
          <div className="chart-tip" style={{ left: Math.min(m.l + hover * slot + slot / 2 + 8, width - 190), top: 8 }} role="status">
            <b>{yFmt(items[hover].value)}</b>
            <div className="faint">{items[hover].label}</div>
            {items[hover].note && <div className="faint">{items[hover].note}</div>}
          </div>
        )}
      </div>
      {caption && <figcaption className="chart-cap">{caption}</figcaption>}
      <details className="chart-table">
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table>
            <tbody>{items.map((it, i) => <tr key={i}><td>{it.label}</td><td className="faint">{it.note}</td><td className="num">{yFmt(it.value)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
