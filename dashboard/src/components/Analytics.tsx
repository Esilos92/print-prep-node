'use client';

import { useState } from 'react';
import { BarChart3, Check, X as XIcon } from 'lucide-react';
import type { Analytics as AnalyticsData } from '@/services/api';
import { formatDuration } from '@/services/api';
import { DATA } from '@/lib/theme';

interface Props {
  analytics: AnalyticsData;
}

const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* ------------------------------------------------------------------ */
/* Stat tiles — headline values are not charts                         */
/* ------------------------------------------------------------------ */

function Tile({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="stat-tile">
      <div className="eyebrow">{label}</div>
      <div className="stat-value" style={{ color: color ?? 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--ink-3)' }}>{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Missions per day — stacked bars, complete over failed               */
/* ------------------------------------------------------------------ */

function MissionsPerDay({ perDay }: { perDay: AnalyticsData['perDay'] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...perDay.map(d => d.completed + d.failed));
  const W = 640;
  const H = 170;
  const PAD = { top: 12, right: 8, bottom: 26, left: 28 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / perDay.length;
  const barW = Math.min(26, slot * 0.62);

  // Ticks name values the chart actually reaches.
  const ticks = max <= 4
    ? Array.from({ length: max + 1 }, (_, i) => i)
    : [0, Math.round(max / 2), max];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="eyebrow">Missions per day · last {perDay.length} days</div>
        {/* Two series, so a legend is always present — with glyphs, not colour alone. */}
        <div className="flex gap-3" style={{ fontSize: '0.7rem' }}>
          <span className="flex items-center gap-1.5" style={{ color: DATA.good }}>
            <Check className="w-3 h-3" aria-hidden /> Complete
          </span>
          <span className="flex items-center gap-1.5" style={{ color: DATA.critical }}>
            <XIcon className="w-3 h-3" aria-hidden /> Failed
          </span>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', maxWidth: '100%', display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={`Missions per day over the last ${perDay.length} days`}
        >
          {ticks.map(t => {
            const y = PAD.top + plotH - (t / max) * plotH;
            return (
              <g key={t}>
                <line
                  x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                  stroke="rgba(0,148,209,0.16)" strokeWidth={1}
                />
                <text
                  x={PAD.left - 7} y={y + 3.5} textAnchor="end"
                  fill="#5b6a8a" fontSize={9} fontFamily="Share Tech Mono, monospace"
                >
                  {t}
                </text>
              </g>
            );
          })}

          {perDay.map((day, i) => {
            const total = day.completed + day.failed;
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const baseY = PAD.top + plotH;

            const hComplete = (day.completed / max) * plotH;
            const hFailed = (day.failed / max) * plotH;
            // 2px surface gap between stacked segments when both are present
            const gap = day.completed > 0 && day.failed > 0 ? 2 : 0;

            return (
              <g
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: total ? 'pointer' : 'default' }}
              >
                {/* generous hit target, larger than the mark */}
                <rect
                  x={PAD.left + i * slot} y={PAD.top}
                  width={slot} height={plotH}
                  fill={hover === i ? 'rgba(0,148,209,0.08)' : 'transparent'}
                />
                {day.failed > 0 && (
                  <rect
                    x={x} y={baseY - hFailed} width={barW} height={hFailed}
                    fill={DATA.critical} rx={3}
                  />
                )}
                {day.completed > 0 && (
                  <rect
                    x={x}
                    y={baseY - hFailed - gap - hComplete}
                    width={barW}
                    height={hComplete}
                    fill={DATA.good}
                    rx={3}
                  />
                )}
                {i % Math.ceil(perDay.length / 7) === 0 && (
                  <text
                    x={PAD.left + i * slot + slot / 2} y={H - 9} textAnchor="middle"
                    fill="#5b6a8a" fontSize={9} fontFamily="Share Tech Mono, monospace"
                  >
                    {dayLabel(day.date)}
                  </text>
                )}
              </g>
            );
          })}

          <line
            x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
            stroke="rgba(0,148,209,0.35)" strokeWidth={1}
          />
        </svg>

        {hover !== null && (perDay[hover].completed + perDay[hover].failed) > 0 && (
          <div
            role="status"
            style={{
              position: 'absolute', top: 0,
              left: `${((hover + 0.5) / perDay.length) * 100}%`,
              transform: 'translateX(-50%)',
              background: 'rgba(5,8,16,0.97)',
              border: '1px solid var(--line)',
              borderRadius: 5, padding: '7px 10px',
              fontSize: '0.72rem', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5
            }}
          >
            <div style={{ color: 'var(--ink)', marginBottom: 3 }}>{dayLabel(perDay[hover].date)}</div>
            <div style={{ color: DATA.good }}>✔ {perDay[hover].completed} complete</div>
            {perDay[hover].failed > 0 && (
              <div style={{ color: DATA.critical }}>✕ {perDay[hover].failed} failed</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top subjects — single series, so no legend; direct-labelled          */
/* ------------------------------------------------------------------ */

function TopSubjects({ subjects }: { subjects: AnalyticsData['topSubjects'] }) {
  if (subjects.length === 0) {
    return (
      <div>
        <div className="eyebrow mb-2">Top subjects by print-ready images</div>
        <div style={{ color: 'var(--ink-3)', fontSize: '0.85rem', padding: '18px 0' }}>
          No completed missions yet.
        </div>
      </div>
    );
  }

  const max = Math.max(...subjects.map(s => s.images), 1);

  return (
    <div>
      <div className="eyebrow mb-3">Top subjects by print-ready images</div>
      <div className="flex flex-col gap-2.5">
        {subjects.map(s => (
          <div key={s.celebrity} className="flex items-center gap-3">
            <div
              style={{
                width: 120, flexShrink: 0, fontSize: '0.8rem', color: 'var(--ink-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
              title={s.celebrity}
            >
              {s.celebrity}
            </div>
            <div style={{ flex: 1, height: 14, background: 'rgba(5,8,16,.6)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(s.images / max) * 100}%`,
                  height: '100%',
                  background: DATA.series,
                  borderRadius: '0 3px 3px 0',
                  minWidth: 3
                }}
              />
            </div>
            <div
              className="tabular-nums"
              style={{ width: 62, textAlign: 'right', fontSize: '0.8rem', color: 'var(--ink)' }}
            >
              {s.images}
              <span style={{ color: 'var(--ink-3)', fontSize: '0.7rem' }}>
                {s.missions > 1 ? ` /${s.missions}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--ink-3)', marginTop: 8 }}>
        Bar length is images delivered. “/n” marks subjects sourced more than once.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Analytics({ analytics }: Props) {
  const [showTable, setShowTable] = useState(false);
  const rate = (analytics.successRate * 100).toFixed(0);

  return (
    <div className="cyber-panel">
      <div className="panel-head">
        <BarChart3 className="w-4 h-4" style={{ color: 'var(--neon-blue)' }} aria-hidden />
        <span className="panel-title">Analytics</span>
        <button
          type="button"
          className="eyebrow ml-auto"
          style={{ color: 'var(--neon-blue)', cursor: 'pointer' }}
          onClick={() => setShowTable(v => !v)}
          aria-expanded={showTable}
        >
          {showTable ? 'Hide data' : 'View data'}
        </button>
      </div>

      <div className="panel-body flex flex-col gap-7">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <Tile label="Missions" value={String(analytics.total)} sub="all time" />
          <Tile
            label="Hit rate"
            value={analytics.total ? `${rate}%` : '—'}
            sub={`${analytics.completed} complete · ${analytics.failed} failed`}
            color={analytics.successRate >= 0.8 ? DATA.good : analytics.successRate >= 0.5 ? DATA.warning : DATA.critical}
          />
          <Tile
            label="Delivered"
            value={String(analytics.imagesDelivered)}
            sub="print-ready images"
            color={DATA.accent}
          />
          <Tile
            label="Median run"
            value={formatDuration(analytics.medianDurationMs)}
            sub="start to Drive link"
          />
        </div>

        <MissionsPerDay perDay={analytics.perDay} />
        <TopSubjects subjects={analytics.topSubjects} />

        {showTable && (
          <div className="scroll-x">
            <table className="data-table">
              <caption className="sr-only">Missions per day, tabular view</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">Complete</th>
                  <th scope="col" className="num">Failed</th>
                </tr>
              </thead>
              <tbody>
                {analytics.perDay.filter(d => d.completed + d.failed > 0).map((d, i) => (
                  <tr key={i}>
                    <th scope="row" style={{ textAlign: 'left', padding: '11px 12px', fontWeight: 400, color: 'var(--ink-2)' }}>
                      {dayLabel(d.date)}
                    </th>
                    <td className="num" style={{ color: DATA.good }}>{d.completed}</td>
                    <td className="num" style={{ color: d.failed ? DATA.critical : 'var(--ink-3)' }}>{d.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
