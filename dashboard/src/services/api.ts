// src/services/api.ts
import type { JobState } from '@/lib/theme';

/**
 * Backend base URL.
 *
 * This was a hardcoded `http://159.223.131.137:4000/api` compiled into the
 * client bundle, which meant the host could not change without a rebuild and
 * the dashboard could never be served over HTTPS (the call would become
 * blocked mixed content). Configure with NEXT_PUBLIC_API_BASE_URL; the
 * fallback is a same-origin relative path so a reverse proxy works untouched.
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') || '/api';

/** Set when the backend has API_KEY configured. */
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return API_KEY ? { ...extra, 'X-API-Key': API_KEY } : extra;
}

export interface JobStatus {
  id: string;
  celebrity: string;
  status: JobState;
  currentPhase: string;
  progress: number;
  roles?: string[];
  imagesProcessed?: number;
  imagesValidated?: number;
  /** Files that survived the print-DPI gate — the real deliverable count. */
  imagesPrintable?: number;
  /** Pipeline warnings surfaced for the operator (missing keys, empty results). */
  problems?: string[];
  downloadLink?: string;
  startTime?: Date;
  endTime?: Date;
  logs?: Array<{ timestamp: Date; message: string }>;
  gBotPhaseChange?: string;
  currentPhaseForGBot?: string;
}

interface StartJobResponse {
  jobId: string;
  status: string;
  celebrity: string;
  message: string;
}

/** Shape returned when the server refuses a job (rate limit, cap, bad name). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function reviveDates<T extends { startTime?: unknown; endTime?: unknown }>(job: T): T {
  if (job.startTime) (job as { startTime?: Date }).startTime = new Date(job.startTime as string);
  if (job.endTime) (job as { endTime?: Date }).endTime = new Date(job.endTime as string);
  return job;
}

class CelebrityAPI {
  private pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private lastJobStates = new Map<string, JobStatus>();

  async startJob(celebrity: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ celebrity })
    });

    if (!response.ok) {
      // The server distinguishes a bad name (400), a missing key (401), the
      // concurrency cap and the rate limit (both 429). Surface its wording —
      // it is written to be read by the operator.
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
    }

    const result: StartJobResponse = await response.json();
    return result.jobId;
  }

  async getJob(jobId: string): Promise<JobStatus | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, { headers: headers() });
      if (response.status === 404) return null;
      if (!response.ok) throw new ApiError(`Status ${response.status}`, response.status);

      const job = reviveDates(await response.json()) as JobStatus;

      const previous = this.lastJobStates.get(jobId);
      if (previous && previous.currentPhaseForGBot !== job.currentPhaseForGBot) {
        job.gBotPhaseChange = job.currentPhaseForGBot;
      }
      this.lastJobStates.set(jobId, { ...job });

      return job;
    } catch (error) {
      console.error('Failed to get job:', error);
      return null;
    }
  }

  async getAllJobs(): Promise<JobStatus[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs`, { headers: headers() });
      if (!response.ok) return [];
      const jobs = await response.json();
      return (jobs as JobStatus[]).map(reviveDates);
    } catch (error) {
      console.error('Failed to get jobs:', error);
      return [];
    }
  }

  startPolling(jobId: string, onUpdate: (job: JobStatus | null) => void): void {
    this.stopPolling(jobId);

    const poll = async () => {
      const job = await this.getJob(jobId);
      onUpdate(job);

      if (!job || job.status === 'completed' || job.status === 'error') {
        this.stopPolling(jobId);
        this.lastJobStates.delete(jobId);
      }
    };

    /**
     * Fetch once straight away. Waiting for the first interval left a
     * three-second window after pressing Send where the mission existed on the
     * server but the dashboard still showed "awaiting mission" — which reads
     * as the click not having worked.
     */
    void poll();

    this.pollingIntervals.set(jobId, setInterval(poll, 3000));
  }

  stopPolling(jobId: string): void {
    const interval = this.pollingIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(jobId);
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: headers()
      });
      this.lastJobStates.delete(jobId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async checkHealth(): Promise<{ connected: boolean; latencyMs?: number }> {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return { connected: response.ok, latencyMs: Date.now() - started };
    } catch {
      return { connected: false };
    }
  }

  cleanup(): void {
    this.pollingIntervals.forEach(clearInterval);
    this.pollingIntervals.clear();
    this.lastJobStates.clear();
  }
}

export const celebrityAPI = new CelebrityAPI();

/* ------------------------------------------------------------------ */
/* Analytics derivation                                                */
/* ------------------------------------------------------------------ */

export interface Analytics {
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  imagesDelivered: number;
  medianDurationMs: number | null;
  /** Counts per day, oldest first, for the requested window. */
  perDay: Array<{ date: Date; completed: number; failed: number }>;
  /** Best-performing subjects by delivered images. */
  topSubjects: Array<{ celebrity: string; images: number; missions: number }>;
}

function durationOf(job: JobStatus): number | null {
  if (!job.startTime || !job.endTime) return null;
  const ms = job.endTime.getTime() - job.startTime.getTime();
  return ms > 0 ? ms : null;
}

/** Images a job actually delivered — printable where known, validated otherwise. */
export function deliveredCount(job: JobStatus): number {
  return job.imagesPrintable || job.imagesValidated || 0;
}

export function computeAnalytics(jobs: JobStatus[], windowDays = 14): Analytics {
  const completed = jobs.filter(j => j.status === 'completed');
  const failed = jobs.filter(j => j.status === 'error');

  const durations = completed
    .map(durationOf)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  const medianDurationMs = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : null;

  // Build an unbroken day axis so quiet days render as gaps, not as absent bars.
  const perDay: Analytics['perDay'] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = windowDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    perDay.push({ date, completed: 0, failed: 0 });
  }

  const indexOfDay = new Map(perDay.map((d, i) => [d.date.toDateString(), i]));

  for (const job of jobs) {
    if (!job.startTime) continue;
    const day = new Date(job.startTime);
    day.setHours(0, 0, 0, 0);
    const index = indexOfDay.get(day.toDateString());
    if (index === undefined) continue;

    if (job.status === 'completed') perDay[index].completed++;
    else if (job.status === 'error') perDay[index].failed++;
  }

  const bySubject = new Map<string, { images: number; missions: number }>();
  for (const job of completed) {
    const entry = bySubject.get(job.celebrity) || { images: 0, missions: 0 };
    entry.images += deliveredCount(job);
    entry.missions += 1;
    bySubject.set(job.celebrity, entry);
  }

  const topSubjects = Array.from(bySubject.entries())
    .map(([celebrity, v]) => ({ celebrity, ...v }))
    .sort((a, b) => b.images - a.images)
    .slice(0, 8);

  return {
    total: jobs.length,
    completed: completed.length,
    failed: failed.length,
    successRate: jobs.length ? completed.length / jobs.length : 0,
    imagesDelivered: completed.reduce((sum, j) => sum + deliveredCount(j), 0),
    medianDurationMs,
    perDay,
    topSubjects
  };
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
