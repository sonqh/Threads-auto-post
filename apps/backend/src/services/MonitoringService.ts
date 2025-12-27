import { postQueue } from "../queue/postQueue.js";

export interface JobStats {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  delayedJobs: number;
  waitingJobs: number;
}

export interface JobDetails {
  id: string;
  name: string;
  state: string;
  data: Record<string, unknown>;
  progress?: number;
  returnvalue?: unknown;
  failedReason?: string;
  attemptsMade: number;
  maxAttempts: number;
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
  scheduledAt?: number;
}

export class MonitoringService {
  /**
   * Get overall queue statistics
   */
  async getQueueStats(): Promise<JobStats> {
    const [active, completed, failed, delayed, waiting] = await Promise.all([
      postQueue.getActiveCount(),
      postQueue.getCompletedCount(),
      postQueue.getFailedCount(),
      postQueue.getDelayedCount(),
      postQueue.getWaitingCount(),
    ]);

    return {
      activeJobs: active,
      completedJobs: completed,
      failedJobs: failed,
      delayedJobs: delayed,
      waitingJobs: waiting,
      totalJobs: active + completed + failed + delayed + waiting,
    };
  }

  /**
   * Get detailed information about a specific job
   */
  async getJobDetails(jobId: string): Promise<JobDetails | null> {
    const job = await postQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const jobProgress = (job as any).progress;
    const progress = typeof jobProgress === "number" ? jobProgress : 0;
    const scheduledAt = (job as any).delay
      ? Date.now() + (job as any).delay
      : undefined;

    return {
      id: job.id!,
      name: job.name,
      state,
      data: job.data,
      progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 1,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      scheduledAt,
    };
  }

  /**
   * Get jobs by state
   */
  async getJobsByState(
    state: "active" | "completed" | "failed" | "delayed" | "waiting",
    limit: number = 20
  ): Promise<JobDetails[]> {
    const jobs = await postQueue.getJobs([state], 0, limit - 1, true);
    return jobs.map((job) => {
      const jobProgress = (job as any).progress;
      const progress = typeof jobProgress === "number" ? jobProgress : 0;
      const scheduledAt = (job as any).delay
        ? Date.now() + (job as any).delay
        : undefined;
      return {
        id: job.id!,
        name: job.name,
        state,
        data: job.data,
        progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts || 1,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        scheduledAt,
      };
    });
  }

  /**
   * Get recent jobs (completed, failed, active, and delayed)
   */
  async getRecentJobs(limit: number = 50): Promise<{
    active: JobDetails[];
    completed: JobDetails[];
    failed: JobDetails[];
    delayed: JobDetails[];
  }> {
    const [active, completed, failed, delayed] = await Promise.all([
      this.getJobsByState("active", limit),
      this.getJobsByState("completed", limit),
      this.getJobsByState("failed", limit),
      this.getJobsByState("delayed", limit),
    ]);

    return { active, completed, failed, delayed };
  }

  /**
   * Get queue health metrics
   */
  async getQueueHealth(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    stats: JobStats;
    healthScore: number;
    lastCompletedJob?: { id: string; timestamp: number };
    failureRate: number;
  }> {
    const stats = await this.getQueueStats();

    // Get last completed job for health check
    const completedJobs = await this.getJobsByState("completed", 1);
    const lastCompletedJob = completedJobs[0];

    // Calculate failure rate
    const totalProcessed = stats.completedJobs + stats.failedJobs;
    const failureRate =
      totalProcessed > 0 ? (stats.failedJobs / totalProcessed) * 100 : 0;

    // Determine health status based on metrics
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    let healthScore = 100;

    if (failureRate > 20) {
      status = "unhealthy";
      healthScore = 50;
    } else if (failureRate > 10) {
      status = "degraded";
      healthScore = 75;
    }

    // Check if queue is processing jobs
    if (stats.activeJobs === 0 && stats.waitingJobs > 10) {
      status = status === "healthy" ? "degraded" : "unhealthy";
      healthScore = Math.min(healthScore, 75);
    }

    return {
      status,
      stats,
      healthScore,
      lastCompletedJob: lastCompletedJob
        ? {
            id: lastCompletedJob.id,
            timestamp: lastCompletedJob.finishedOn || 0,
          }
        : undefined,
      failureRate: Math.round(failureRate * 100) / 100,
    };
  }
}

export const monitoringService = new MonitoringService();
