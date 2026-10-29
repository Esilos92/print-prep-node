'use client';

import { ListChecks } from 'lucide-react';
import type { Roster, RosterItem } from '@/services/api';
import { DATA } from '@/lib/theme';

interface Props {
  roster: Roster;
  onStop: () => void;
  onResume: () => void;
  onClear: () => void;
}

const STATUS: Record<RosterItem['status'], { glyph: string; label: string; color: string }> = {
  waiting: { glyph: '·', label: 'waiting', color: 'var(--ink-3)' },
  running: { glyph: '▸', label: 'working', color: DATA.series },
  done: { glyph: '✔', label: 'done', color: DATA.good },
  failed: { glyph: '✕', label: 'failed', color: DATA.critical }
};

const HEADLINE: Record<Roster['status'], string> = {
  idle: '',
  running: 'Working through the list',
  stopping: 'Stopping after this guest',
  stopped: 'Paused',
  done: 'All done'
};

export default function RosterPanel({ roster, onStop, onResume, onClear }: Props) {
  const { counts } = roster;
  const total = roster.items.length;
  const finished = counts.done + counts.failed;

  return (
    <div className="cyber-panel">
      <div className="panel-head">
        <ListChecks className="w-4 h-4" style={{ color: 'var(--neon-blue)' }} aria-hidden />
        <span className="panel-title">Bulk Roster</span>
        <span className="eyebrow ml-auto">{finished}/{total} finished</span>
      </div>

      <div className="panel-body flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" style={{ fontSize: '0.85rem', color: 'var(--ink-2)' }}>
          <span>{HEADLINE[roster.status]}</span>
          <span style={{ color: 'var(--ink-3)' }}>
            · {counts.done} done{counts.failed ? ` · ${counts.failed} failed` : ''}{counts.waiting ? ` · ${counts.waiting} waiting` : ''}
          </span>
          <span className="flex gap-2 ml-auto">
            {roster.status === 'running' && (
              <button type="button" className="cyber-button" onClick={onStop}>Stop after this guest</button>
            )}
            {(roster.status === 'stopped') && counts.waiting > 0 && (
              <button type="button" className="cyber-button" onClick={onResume}>Resume</button>
            )}
            {['stopped', 'done'].includes(roster.status) && (
              <button type="button" className="cyber-button" onClick={onClear}>Clear list</button>
            )}
          </span>
        </div>

        <ol className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {roster.items.map(item => {
            const st = STATUS[item.status];
            return (
              <li
                key={item.id}
                style={{
                  border: '1px solid rgba(0,148,209,.22)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  background: item.status === 'running' ? 'rgba(0,148,209,.08)' : 'transparent'
                }}
              >
                <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                  <span aria-hidden style={{ color: st.color, width: 14 }}>{st.glyph}</span>
                  <span style={{ color: 'var(--ink)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                  <span style={{ color: 'var(--ink-3)', fontSize: '0.72rem' }}>
                    {item.titles.length ? `${item.titles.length} title${item.titles.length === 1 ? '' : 's'}` : 'Auto'}
                  </span>
                  <span className="ml-auto" style={{ color: st.color, fontSize: '0.72rem' }}>{st.label}</span>
                </div>

                {item.status === 'done' && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: 4, paddingLeft: 22 }}>
                    {item.printable} print-ready file{item.printable === 1 ? '' : 's'}
                    {item.downloadLink && (
                      <> · <a href={item.downloadLink} target="_blank" rel="noreferrer" style={{ color: 'var(--neon-blue)' }}>Open in Drive</a></>
                    )}
                  </div>
                )}
                {item.status === 'failed' && item.error && (
                  <div style={{ fontSize: '0.75rem', color: DATA.critical, marginTop: 4, paddingLeft: 22 }}>{item.error}</div>
                )}
                {item.notes.length > 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink-3)', marginTop: 2, paddingLeft: 22 }}>
                    {item.notes[item.notes.length - 1]}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
