'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import GBotTerminal from '@/components/GBotTerminal';
import MissionStatus from '@/components/MissionStatus';
import SubjectLog from '@/components/SubjectLog';
import Analytics from '@/components/Analytics';
import { celebrityAPI, computeAnalytics, ApiError, type JobStatus } from '@/services/api';
import { DATA } from '@/lib/theme';

type Tab = 'ops' | 'log' | 'analytics';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'ops', label: 'Operations' },
  { id: 'log', label: 'Subject Log' },
  { id: 'analytics', label: 'Analytics' }
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('ops');
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  const loadJobs = useCallback(async () => {
    setJobs(await celebrityAPI.getAllJobs());
  }, []);

  useEffect(() => {
    loadJobs();
    celebrityAPI.checkHealth().then(h => setOnline(h.connected));

    const health = setInterval(
      () => celebrityAPI.checkHealth().then(h => setOnline(h.connected)),
      30000
    );

    return () => {
      clearInterval(health);
      celebrityAPI.cleanup();
    };
  }, [loadJobs]);

  /**
   * Resume polling if the page is reloaded while a mission is in flight —
   * the job lives on the server, so a refresh should not orphan it.
   */
  useEffect(() => {
    if (currentJobId) return;
    const running = jobs.find(j => j.status === 'running');
    if (!running) return;

    setCurrentJobId(running.id);
    setCurrentJob(running);
    celebrityAPI.startPolling(running.id, job => {
      setCurrentJob(job);
      if (job && (job.status === 'completed' || job.status === 'error')) {
        setCurrentJobId(null);
        loadJobs();
      }
    });
  }, [jobs, currentJobId, loadJobs]);

  /** Returns an error string for GBot to speak, or null on success. */
  const startJob = useCallback(async (name: string): Promise<string | null> => {
    try {
      const jobId = await celebrityAPI.startJob(name);
      setCurrentJobId(jobId);
      setTab('ops');

      celebrityAPI.startPolling(jobId, job => {
        setCurrentJob(job);
        if (job && (job.status === 'completed' || job.status === 'error')) {
          setCurrentJobId(null);
          loadJobs();
        }
      });

      return null;
    } catch (error) {
      // The server's wording is written for the operator — pass it through
      // rather than replacing it with a generic failure message.
      return error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    }
  }, [loadJobs]);

  const cancelJob = useCallback(async () => {
    if (!currentJobId) return;
    await celebrityAPI.cancelJob(currentJobId);
    celebrityAPI.stopPolling(currentJobId);
    setCurrentJob(null);
    setCurrentJobId(null);
    loadJobs();
  }, [currentJobId, loadJobs]);

  const analytics = useMemo(() => computeAnalytics(jobs), [jobs]);
  const lastJob = jobs[0] ?? null;
  const busy = currentJob?.status === 'running';

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="cyber-grid" aria-hidden />

      <div
        style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1240px', margin: '0 auto',
          paddingInline: '20px', paddingBlock: '28px 56px'
        }}
      >
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Super Conventions · print prep</div>
            <h1
              className="font-cyber glow-blue"
              style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 900, letterSpacing: '0.06em' }}
            >
              CELEBRITY IMAGE SOURCING
            </h1>
          </div>

          <div
            className="flex items-center gap-2 status-chip"
            style={{ color: online === false ? DATA.critical : online ? DATA.good : 'var(--ink-3)' }}
          >
            {online === false
              ? <><WifiOff className="w-3 h-3" aria-hidden /> BACKEND OFFLINE</>
              : online
                ? <><Wifi className="w-3 h-3" aria-hidden /> LINK ACTIVE</>
                : <>· CONNECTING</>}
          </div>
        </header>

        {online === false && (
          <div
            className="mb-5 rounded"
            style={{ border: `1px solid ${DATA.critical}`, background: 'rgba(233,54,92,.1)', padding: '12px 14px' }}
          >
            <div className="font-cyber" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: DATA.critical, marginBottom: 4 }}>
              ✕ NO LINK TO SOURCING BACKEND
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--ink-2)' }}>
              The API is not reachable. Missions cannot be started until it responds.
              On the droplet: <code className="font-term">pm2 restart api-server</code>
            </div>
          </div>
        )}

        <nav className="tab-bar mb-5" role="tablist" aria-label="Dashboard sections">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className="tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'ops' && busy && (
                <span style={{ color: DATA.series, marginLeft: 6 }} aria-label="mission running">●</span>
              )}
            </button>
          ))}
        </nav>

        <div
          role="tabpanel"
          id="panel-ops"
          aria-labelledby="tab-ops"
          hidden={tab !== 'ops'}
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}
        >
          <GBotTerminal
            currentJob={currentJob}
            analytics={analytics}
            lastJob={lastJob}
            onStartJob={startJob}
            busy={!!busy}
          />
          <MissionStatus currentJob={currentJob} onCancel={cancelJob} />
        </div>

        <div role="tabpanel" id="panel-log" aria-labelledby="tab-log" hidden={tab !== 'log'}>
          <SubjectLog jobs={jobs} />
        </div>

        <div role="tabpanel" id="panel-analytics" aria-labelledby="tab-analytics" hidden={tab !== 'analytics'}>
          <Analytics analytics={analytics} />
        </div>
      </div>
    </div>
  );
}
