import { useState } from 'react';
import { tomanShort, fa } from '../lib/format';

export interface BarDatum {
  key: string | number;
  label: string;
  /** tooltip title */
  title: string;
  value: number;
  sub?: string;
  dim?: boolean;
}

/**
 * Single-series bar chart (one hue, recessive grid, rounded data-ends anchored to
 * the baseline, hover tooltip, and an accessible table fallback).
 */
export function BarChart({ data, height = 220, labelEvery = 1, caption }: { data: BarDatum[]; height?: number; labelEvery?: number; caption: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const padTop = 12, padBottom = 26, padSide = 44;
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const innerW = W - padSide - 8;
  const innerH = H - padTop - padBottom;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(28, slot - 2));
  const ticks = [0, 0.5, 1].map((t) => t * nice);
  // RTL: time flows right → left, so the oldest bar sits at the right edge.
  const xOf = (i: number) => W - 8 - slot * (i + 1) + (slot - barW) / 2;
  const yOf = (v: number) => padTop + innerH - (v / nice) * innerH;
  const hd = hover !== null ? data[hover] : null;

  return (
    <figure className="chart-wrap" style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={padSide} x2={W - 8} y1={yOf(t)} y2={yOf(t)} />
            <text className="axis-text" x={4} y={yOf(t) + 4} textAnchor="start">
              {t === 0 ? '۰' : tomanShort(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = xOf(i);
          const y = yOf(d.value);
          const h = Math.max(0, padTop + innerH - y);
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.key}>
              {h > 0 && (
                <path
                  className={`bar${d.dim ? ' dim' : ''}`}
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % labelEvery === 0 && (
                <text className="axis-text" x={x + barW / 2} y={H - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
              <rect className="hit" x={x - (slot - barW) / 2} y={padTop} width={slot} height={innerH} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hd && hover !== null && (
        <div className="tooltip" style={{ left: `${((xOf(hover) + barW / 2) / W) * 100}%`, top: `${(yOf(hd.value) / H) * 100}%` }}>
          <div style={{ opacity: 0.75 }}>{hd.title}</div>
          <b className="num">{fa(hd.value)} تومان</b>
          {hd.sub && <div style={{ opacity: 0.75 }}>{hd.sub}</div>}
        </div>
      )}
      <figcaption className="sr-only">
        <table>
          <caption>{caption}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th>{d.title}</th>
                <td>{fa(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

function niceMax(v: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * exp;
}

export function Sparkline({ values, width = 120, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  // RTL: latest value on the left
  const pts = values.map((v, i) => `${width - i * step},${height - 3 - (v / max) * (height - 6)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width - (values.length - 1) * step} cy={height - 3 - (values[values.length - 1] / max) * (height - 6)} r="3" fill="var(--chart)" />
    </svg>
  );
}
