// src/services/api.ts
import type { JobState } from '@/lib/theme';

/**
 * The browser calls /api on the dashboard itself, which forwards to the API
 * on the same machine (see next.config.js). The API is not reachable from
 * the internet directly, so there is no backend URL to configure here.
 */
const API_BASE_URL = '/api';

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return extra;
}

export type Mode = 'auto' | 'select' | 'custom';

/** A role as the backend describes it, ready to send back with a job. */
export interface RoleChoice {
  character: string;
  title: string;
  year: string;
  tmdbId: number | null;
  mediaType: 'tv' | 'movie' | null;
  medium: string;
  isVoiceRole?: boolean;
  poster?: string | null;
  episodes?: number | null;
  /** Released in the last few months: photos may still be scarce. */
  recent?: boolean;
  source?: 'tmdb' | 'manual';
}

export interface RoleList {
  person: { name: string; id: number } | null;
  roles: RoleChoice[];
  sort: 'popular' | 'newest';
}

export type ResolvedTitle =
  | { input: string; status: 'matched'; role: RoleChoice }
  | { input: string; status: 'not_found'; guess: { title: string; year: string; tmdbId: number; mediaType: 'tv' | 'movie'; poster: string | null } | null };

export interface RoleResult {
  character: string;
  title: string;
  selected: number;
  byKind: Record<string, number>;
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
  /** One entry per finished role, in order. */
  roleResults?: RoleResult[];
  mode?: Mode;
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

  async startJob(celebrity: string, options: { roles?: RoleChoice[]; mode?: Mode } = {}): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ celebrity, roles: options.roles, mode: options.mode })
    });

    if (!response.ok) {
      // The server's wording is written to be read by the operator.
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
    }

    const result: StartJobResponse = await response.json();
    return result.jobId;
  }

  /** Select mode: roles to choose from. */
  async listRoles(name: string, sort: 'popular' | 'newest'): Promise<RoleList> {
    const response = await fetch(`${API_BASE_URL}/roles?name=${encodeURIComponent(name)}&sort=${sort}&limit=10`, { headers: headers() });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
    return body as RoleList;
  }

  /** Custom mode: match typed titles to the person's credits. */
  async resolveTitles(name: string, titles: string[]): Promise<ResolvedTitle[]> {
    const response = await fetch(`${API_BASE_URL}/roles/resolve`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, titles })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
    return body.results as ResolvedTitle[];
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
