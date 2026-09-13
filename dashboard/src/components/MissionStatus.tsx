'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock, CircleDot, Check, AlertTriangle, Ban } from 'lucide-react';
import type { JobStatus } from '@/services/api';
import { deliveredCount } from '@/services/api';
import { PHASES, DATA, STATUS } from '@/lib/theme';

interface Props {
  currentJob: JobStatus | null;
  onCancel: () => void;
}

function elapsed(start?: Date) {
  if (!start) return '0s';
  const total = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** Counter tile. The label says what the number means in pipeline terms. */
function Counter({ label, value, note, color }: { label: string; value: number; note: string; color: string }) {
  return (
    <div className="stat-tile">
      <div className="eyebrow">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--ink-3)' }}>{note}</div>
    </div>
  );
}

export default function MissionStatus({ currentJob, onCancel }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (currentJob?.status !== 'running') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [currentJob?.status]);

  if (!currentJob) {
    return (
      <div className="cyber-panel">
        <div className="panel-head">
          <Activity className="w-4 h-4" style={{ color: 'var(--neon-blue)' }} aria-hidden />
          <span className="panel-title">Mission Status</span>
        </div>
        <div className="panel-body" style={{ padding: '48px 18px', textAlign: 'center' }}>
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full"
            style={{ width: 64, height: 64, border: '1px solid var(--line)', background: 'rgba(5,8,16,.6)' }}
          >
            <CircleDot className="w-7 h-7" style={{ color: 'var(--ink-3)' }} aria-hidden />
          </div>
          <div className="font-cyber" style={{ letterSpacing: '0.14em', color: 'var(--ink-2)' }}>
            AWAITING MISSION
          </div>
          <p style={{ color: 'var(--ink-3)', fontSize: '0.85rem', marginTop: 6 }}>
            Give GBot a subject name to begin.
          </p>
        </div>
      </div>
    );
  }

  const status = STATUS[currentJob.status] ?? STATUS.idle;
  const activeIndex = PHASES.findIndex(p => p.key === currentJob.currentPhaseForGBot);

  return (
    <div className={`cyber-panel ${currentJob.status === 'running' ? 'panel-live' : ''}`}>
      <div className="panel-head">
        <Activity className="w-4 h-4" style={{ color: 'var(--neon-blue)' }} aria-hidden />
        <span className="panel-title">Mission Status</span>
        <span className="status-chip ml-auto" style={{ color: status.color }}>
          <span aria-hidden>{status.glyph}</span>
          {status.label}
        </span>
      </div>

      <div className="panel-body flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="eyebrow">Subject</div>
            <div className="font-cyber glow-pink" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {currentJob.celebrity}
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
            <Clock className="w-3.5 h-3.5" aria-hidden />
            <span className="font-term tabular-nums">{elapsed(currentJob.startTime)}</span>
          </div>
        </div>

        {/* progress */}
        <div>
          <div className="flex justify-between mb-2" style={{ fontSize: '0.78rem', color: 'var(--ink-2)' }}>
            <span>{currentJob.currentPhase}</span>
            <span className="font-term tabular-nums">{currentJob.progress}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={currentJob.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Mission progress for ${currentJob.celebrity}`}
          >
            <motion.div
              className="progress-fill"
              animate={{ width: `${currentJob.progress}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* counters — the funnel, in order, so attrition is visible */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          <Counter label="Roles" value={currentJob.roles?.length ?? 0} note="distinct characters" color={DATA.series} />
          <Counter label="Downloaded" value={currentJob.imagesProcessed ?? 0} note="candidates fetched" color={DATA.series} />
          <Counter label="Verified" value={currentJob.imagesValidated ?? 0} note="identity confirmed" color={DATA.good} />
          <Counter label="Print-ready" value={deliveredCount(currentJob)} note="cleared DPI floor" color={DATA.accent} />
        </div>

        {/* problems the pipeline reported */}
        {currentJob.problems && currentJob.problems.length > 0 && (
          <div
            className="rounded"
            style={{ border: `1px solid ${DATA.warning}`, background: 'rgba(190,115,0,.1)', padding: '10px 12px' }}
          >
            <div className="flex items-center gap-2 mb-1" style={{ color: DATA.warning }}>
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
              <span className="font-cyber" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>PIPELINE NOTICE</span>
            </div>
            {currentJob.problems.map((p, i) => (
              <div key={i} style={{ fontSize: '0.82rem', color: 'var(--ink-2)' }}>{p}</div>
            ))}
          </div>
        )}

        {/* roles discovered */}
        {currentJob.roles && currentJob.roles.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Roles locked</div>
            <div className="flex flex-wrap gap-2">
              {currentJob.roles.map(role => (
                <span
                  key={role}
                  className="font-term"
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 9px',
                    borderRadius: 4,
                    border: '1px solid var(--line)',
                    background: 'rgba(0,148,209,.08)',
                    color: 'var(--ink-2)'
                  }}
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* phase ladder */}
        <div>
          <div className="eyebrow mb-2">Pipeline</div>
          <ol className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {PHASES.map((phase, i) => {
              const done = activeIndex > i || currentJob.progress >= 100;
              const active = activeIndex === i;
              return (
                <li key={phase.key} className="flex items-center gap-2" style={{ fontSize: '0.8rem' }}>
                  <span
                    className="flex items-center justify-center rounded-full flex-shrink-0"
                    style={{
                      width: 16, height: 16,
                      border: `1px solid ${done ? DATA.good : active ? DATA.series : 'var(--line)'}`,
                      color: done ? DATA.good : DATA.series
                    }}
                    aria-hidden
                  >
                    {done ? <Check className="w-2.5 h-2.5" /> : active ? (
                      <motion.span
                        className="rounded-full"
                        style={{ width: 6, height: 6, background: DATA.series, display: 'block' }}
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.4 }}
                      />
                    ) : null}
                  </span>
                  <span style={{ color: done ? 'var(--ink)' : active ? DATA.series : 'var(--ink-3)' }}>
                    {phase.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {currentJob.status === 'running' && (
          <button type="button" className="cyber-button pink self-start" onClick={onCancel}>
            <Ban className="w-3.5 h-3.5" aria-hidden />
            Abort mission
          </button>
        )}
      </div>
    </div>
  );
}
