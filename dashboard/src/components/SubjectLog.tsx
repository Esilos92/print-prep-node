'use client';

import { useMemo, useState } from 'react';
import { Search, ExternalLink, FileArchive, X } from 'lucide-react';
import type { JobStatus } from '@/services/api';
import { deliveredCount, formatDuration } from '@/services/api';
import { STATUS, DATA } from '@/lib/theme';

interface Props {
  jobs: JobStatus[];
}

type SortKey = 'date' | 'subject' | 'images';
type Filter = 'all' | 'completed' | 'error';

function durationOf(job: JobStatus): number | null {
  if (!job.startTime || !job.endTime) return null;
  const ms = job.endTime.getTime() - job.startTime.getTime();
  return ms > 0 ? ms : null;
}

/** Shows and films this subject was sourced for — the part an operator scans. */
function titlesOf(job: JobStatus): string {
  if (!job.roles?.length) return '—';
  return job.roles
    .map(role => {
      const match = role.match(/\(([^)]+)\)$/);
      return match ? match[1] : role;
    })
    .join(', ');
}

export default function SubjectLog({ jobs }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('date');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = jobs.filter(job => {
      if (filter !== 'all' && job.status !== filter) return false;
      if (!needle) return true;

      // Search the subject and every role, so "Lethal Weapon" finds the
      // mission even though the subject is "Danny Glover".
      const haystack = [job.celebrity, ...(job.roles ?? [])].join(' ').toLowerCase();
      return haystack.includes(needle);
    });

    return matched.sort((a, b) => {
      if (sort === 'subject') return a.celebrity.localeCompare(b.celebrity);
      if (sort === 'images') return deliveredCount(b) - deliveredCount(a);
      return (b.startTime?.getTime() ?? 0) - (a.startTime?.getTime() ?? 0);
    });
  }, [jobs, query, filter, sort]);

  const counts = useMemo(() => ({
    all: jobs.length,
    completed: jobs.filter(j => j.status === 'completed').length,
    error: jobs.filter(j => j.status === 'error').length
  }), [jobs]);

  return (
    <div className="cyber-panel">
      <div className="panel-head">
        <FileArchive className="w-4 h-4" style={{ color: 'var(--neon-blue)' }} aria-hidden />
        <span className="panel-title">Subject Log</span>
        <span className="eyebrow ml-auto">{rows.length} of {jobs.length}</span>
      </div>

      <div className="panel-body flex flex-col gap-4">
        {/* controls — one row above the data */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1" style={{ minWidth: '200px' }}>
            <Search
              className="w-4 h-4 absolute pointer-events-none"
              style={{ left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }}
              aria-hidden
            />
            <label htmlFor="subject-search" className="sr-only">Search subjects and roles</label>
            <input
              id="subject-search"
              className="cyber-input"
              style={{ paddingLeft: 34, paddingRight: query ? 34 : 14 }}
              placeholder="search subject or role…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-1" role="group" aria-label="Filter by outcome">
            {(['all', 'completed', 'error'] as Filter[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className="font-cyber"
                style={{
                  fontSize: '0.62rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '8px 11px',
                  borderRadius: 5,
                  border: `1px solid ${filter === f ? 'var(--neon-blue)' : 'var(--line-soft)'}`,
                  color: filter === f ? 'var(--neon-blue)' : 'var(--ink-3)',
                  background: filter === f ? 'rgba(0,191,255,.1)' : 'transparent'
                }}
              >
                {f === 'all' ? 'All' : f === 'completed' ? 'Complete' : 'Failed'} ({counts[f]})
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="subject-sort" className="sr-only">Sort by</label>
            <select
              id="subject-sort"
              className="cyber-input"
              style={{ width: 'auto', padding: '10px 12px', fontSize: '0.8rem' }}
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
            >
              <option value="date">Newest first</option>
              <option value="subject">Subject A–Z</option>
              <option value="images">Most images</option>
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            {jobs.length === 0
              ? 'No missions logged yet.'
              : `Nothing matches “${query}”.`}
          </div>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <caption className="sr-only">Completed and failed sourcing missions</caption>
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Roles sourced</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Print-ready</th>
                  <th scope="col" className="num">Runtime</th>
                  <th scope="col">Date</th>
                  <th scope="col"><span className="sr-only">Package</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(job => {
                  const status = STATUS[job.status] ?? STATUS.idle;
                  return (
                    <tr key={job.id}>
                      <th scope="row" style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'left', padding: '11px 12px', fontSize: '0.88rem' }}>
                        {job.celebrity}
                      </th>
                      <td style={{ color: 'var(--ink-2)', maxWidth: 260 }}>{titlesOf(job)}</td>
                      <td>
                        <span className="status-chip" style={{ color: status.color }}>
                          <span aria-hidden>{status.glyph}</span>
                          {status.label}
                        </span>
                      </td>
                      <td className="num" style={{ color: deliveredCount(job) ? DATA.accent : 'var(--ink-3)' }}>
                        {deliveredCount(job) || '—'}
                      </td>
                      <td className="num" style={{ color: 'var(--ink-2)' }}>{formatDuration(durationOf(job))}</td>
                      <td style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {job.startTime ? job.startTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td>
                        {job.downloadLink ? (
                          <a
                            className="cyber-button"
                            style={{ padding: '7px 12px', fontSize: '0.65rem' }}
                            href={job.downloadLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3 h-3" aria-hidden />
                            Open
                            <span className="sr-only"> package for {job.celebrity} in Google Drive</span>
                          </a>
                        ) : (
                          <span style={{ color: 'var(--ink-3)', fontSize: '0.75rem' }}>no link</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
