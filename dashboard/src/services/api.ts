// src/services/api.ts
// Real API integration for your exact backend

const API_BASE_URL = 'http://159.223.131.137:4000/api';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
  roles?: string[];
  imagesProcessed?: number;
  imagesValidated?: number;
  downloadLink?: string;
  startTime?: Date;
  endTime?: Date;
  logs?: Array<{ timestamp: Date; message: string }>;
}

interface StartJobResponse {
  jobId: string;
  status: string;
  celebrity: string;
  message: string;
}

class CelebrityAPI {
  private pollingIntervals = new Map<string, NodeJS.Timeout>();

  // Start new celebrity processing job
  async startJob(celebrity: string): Promise<string> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ celebrity }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start job');
      }

      const result: StartJobResponse = await response.json();
      return result.jobId;
    } catch (error) {
      console.error('Failed to start job:', error);
      throw error;
    }
  }

  // Get job status
  async getJob(jobId: string): Promise<JobStatus | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
      
      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to get job status: ${response.status}`);
      }

      const job = await response.json();
      
      // Convert date strings back to Date objects
      if (job.startTime) job.startTime = new Date(job.startTime);
      if (job.endTime) job.endTime = new Date(job.endTime);
      
      return job;
    } catch (error) {
      console.error('Failed to get job:', error);
      return null;
    }
  }

  // Get all jobs (for history)
  async getAllJobs(): Promise<JobStatus[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs`);
      
      if (!response.ok) {
        throw new Error(`Failed to get jobs: ${response.status}`);
      }

      const jobs = await response.json();
      
      // Convert date strings back to Date objects
      return jobs.map((job: any) => ({
        ...job,
        startTime: job.startTime ? new Date(job.startTime) : undefined,
        endTime: job.endTime ? new Date(job.endTime) : undefined
      }));
    } catch (error) {
      console.error('Failed to get jobs:', error);
      return [];
    }
  }

  // Start polling for job updates
  startPolling(jobId: string, onUpdate: (job: JobStatus | null) => void): void {
    // Clear existing polling
    this.stopPolling(jobId);

    // Poll every 3 seconds
    const interval = setInterval(async () => {
      const job = await this.getJob(jobId);
      onUpdate(job);
      
      // Stop polling if job is complete or failed
      if (job && (job.status === 'completed' || job.status === 'error')) {
        this.stopPolling(jobId);
      }
    }, 3000);

    this.pollingIntervals.set(jobId, interval);
  }

  // Stop polling for job updates
  stopPolling(jobId: string): void {
    const interval = this.pollingIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(jobId);
    }
  }

  // Cancel a running job
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
        method: 'DELETE',
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to cancel job:', error);
      return false;
    }
  }

  // Get download link for completed job
  async getDownloadLink(jobId: string): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/download`);
      
      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.downloadUrl;
    } catch (error) {
      console.error('Failed to get download link:', error);
      return null;
    }
  }

  // Check API health
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Clean up all polling intervals
  cleanup(): void {
    this.pollingIntervals.forEach(interval => clearInterval(interval));
    this.pollingIntervals.clear();
  }
}

// Singleton instance
export const celebrityAPI = new CelebrityAPI();

// Export types
export type { JobStatus };
