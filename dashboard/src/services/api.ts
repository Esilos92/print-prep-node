// src/services/api.ts
// Enhanced API integration with all 5 fixes

const API_BASE_URL = 'http://159.223.131.137:4000/api';

interface JobStatus {
  id: string;
  celebrity: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentPhase: string;
  progress: number;
  roles?: string[]; // 🎯 FIX #2: Real role names from backend
  imagesProcessed?: number;
  imagesValidated?: number;
  downloadLink?: string;
  startTime?: Date;
  endTime?: Date;
  logs?: Array<{ timestamp: Date; message: string }>;
  gBotPhaseChange?: string; // 🎯 FIX #1: Phase change detection
  currentPhaseForGBot?: string; // 🎯 FIX #1: Current phase tracking
}

interface StartJobResponse {
  jobId: string;
  status: string;
  celebrity: string;
  message: string;
}

class CelebrityAPI {
  private pollingIntervals = new Map<string, NodeJS.Timeout>();
  private lastJobStates = new Map<string, JobStatus>(); // 🎯 FIX #1: Track state changes

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

  // Get job status with enhanced change detection
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
      
      // 🎯 FIX #1: Detect phase changes for GBot announcements
      const lastState = this.lastJobStates.get(jobId);
      if (lastState && lastState.currentPhaseForGBot !== job.currentPhaseForGBot) {
        job.gBotPhaseChange = job.currentPhaseForGBot;
      }
      
      // Update last known state
      this.lastJobStates.set(jobId, { ...job });
      
      return job;
    } catch (error) {
      console.error('Failed to get job:', error);
      return null;
    }
  }

  // Get all jobs (for history) with better error handling
  async getAllJobs(): Promise<JobStatus[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs`);
      
      if (!response.ok) {
        // Don't throw for history loading failures - just return empty array
        console.warn(`Failed to get jobs: ${response.status}`);
        return [];
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
      return []; // Return empty array instead of throwing
    }
  }

  // Start polling for job updates with enhanced change detection
  startPolling(jobId: string, onUpdate: (job: JobStatus | null) => void): void {
    // Clear existing polling
    this.stopPolling(jobId);

    // Poll every 3 seconds
    const interval = setInterval(async () => {
      const job = await this.getJob(jobId);
      
      if (job) {
        // 🎯 FIX #1: Always call onUpdate to ensure phase changes are detected
        onUpdate(job);
        
        // Stop polling if job is complete or failed
        if (job.status === 'completed' || job.status === 'error') {
          this.stopPolling(jobId);
          // Clean up state tracking
          this.lastJobStates.delete(jobId);
        }
      } else {
        onUpdate(null);
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

      // Clean up state tracking on cancel
      this.lastJobStates.delete(jobId);
      
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

  // Check API health with timeout
  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${API_BASE_URL}/health`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn('Health check failed:', error);
      return false;
    }
  }

  // Clean up all polling intervals and state
  cleanup(): void {
    this.pollingIntervals.forEach(interval => clearInterval(interval));
    this.pollingIntervals.clear();
    this.lastJobStates.clear();
  }

  // 🎯 NEW: Get connection status
  async getConnectionStatus(): Promise<{ connected: boolean; latency?: number }> {
    const start = Date.now();
    const connected = await this.checkHealth();
    const latency = connected ? Date.now() - start : undefined;
    
    return { connected, latency };
  }

  // 🎯 NEW: Retry failed requests
  private async retryRequest<T>(
    requestFn: () => Promise<T>, 
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        
        console.warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    
    throw new Error('Max retries exceeded');
  }
}

// Singleton instance
export const celebrityAPI = new CelebrityAPI();

// Export types
export type { JobStatus };
