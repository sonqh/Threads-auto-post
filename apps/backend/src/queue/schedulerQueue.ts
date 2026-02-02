import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis.js";
import { log } from "../config/logger.js";

const connection = createRedisConnection();

/**
 * Dedicated queue for scheduler meta-jobs
 * This queue only manages the "check for due posts" job
 */
export const schedulerQueue = new Queue("scheduler-meta", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      count: 10,
      age: 3600, // 1 hour
    },
    removeOnFail: {
      count: 50,
    },
  },
});

/**
 * Redis keys for scheduler state
 */
export const SCHEDULER_KEYS = {
  NEXT_EXECUTION_AT: "scheduler:nextExecutionAt",
  ACTIVE_JOB_ID: "scheduler:activeJobId",
  LAST_CHECK: "scheduler:lastCheck",
  SCHEDULER_LOCK: "scheduler:lock", // Distributed lock for atomic operations
} as const;

/**
 * Get the next execution timestamp from Redis
 */
export async function getNextExecutionAt(): Promise<number | null> {
  const value = await connection.get(SCHEDULER_KEYS.NEXT_EXECUTION_AT);
  return value ? parseInt(value, 10) : null;
}

/**
 * Set the next execution timestamp in Redis
 */
export async function setNextExecutionAt(timestamp: number): Promise<void> {
  await connection.set(SCHEDULER_KEYS.NEXT_EXECUTION_AT, timestamp.toString());
  log.info(
    `📅 Next scheduler run set for: ${new Date(timestamp).toISOString()}`
  );
}

/**
 * Get the active scheduler job ID
 */
export async function getActiveSchedulerJobId(): Promise<string | null> {
  return connection.get(SCHEDULER_KEYS.ACTIVE_JOB_ID);
}

/**
 * Set the active scheduler job ID
 */
export async function setActiveSchedulerJobId(jobId: string): Promise<void> {
  await connection.set(SCHEDULER_KEYS.ACTIVE_JOB_ID, jobId);
}

/**
 * Clear scheduler state
 */
export async function clearSchedulerState(): Promise<void> {
  await connection.del(SCHEDULER_KEYS.NEXT_EXECUTION_AT);
  await connection.del(SCHEDULER_KEYS.ACTIVE_JOB_ID);
  log.info("🧹 Scheduler state cleared");
}

/**
 * Acquire distributed lock for scheduler operations
 * Uses Redis SETNX with expiration to prevent deadlocks
 *
 * @param lockTimeout - Lock timeout in seconds (default: 10s)
 * @returns true if lock acquired, false otherwise
 */
export async function acquireSchedulerLock(
  lockTimeout: number = 10
): Promise<boolean> {
  try {
    // SETNX with expiration: only set if not exists
    const result = await connection.set(
      SCHEDULER_KEYS.SCHEDULER_LOCK,
      Date.now().toString(),
      "EX",
      lockTimeout,
      "NX"
    );
    return result === "OK";
  } catch (error) {
    log.error("Failed to acquire scheduler lock:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Release distributed lock
 */
export async function releaseSchedulerLock(): Promise<void> {
  try {
    await connection.del(SCHEDULER_KEYS.SCHEDULER_LOCK);
  } catch (error) {
    log.error("Failed to release scheduler lock:", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Execute function with distributed lock
 * Automatically acquires and releases lock
 *
 * @param fn - Function to execute while holding lock
 * @param lockTimeout - Lock timeout in seconds (default: 10s)
 * @param maxWaitTime - Maximum time to wait for lock in ms (default: 5000ms)
 * @returns Result of function execution, or null if lock not acquired
 */
export async function withSchedulerLock<T>(
  fn: () => Promise<T>,
  lockTimeout: number = 10,
  maxWaitTime: number = 5000
): Promise<T | null> {
  const startTime = Date.now();
  let acquired = false;

  // Try to acquire lock with retry
  while (!acquired && Date.now() - startTime < maxWaitTime) {
    acquired = await acquireSchedulerLock(lockTimeout);
    if (!acquired) {
      // Wait 100ms before retry
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!acquired) {
    log.warn("Failed to acquire scheduler lock within timeout");
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseSchedulerLock();
  }
}

/**
 * Clean up stale scheduler jobs
 * Removes jobs that are no longer in delayed state
 */
export async function cleanupStaleJobs(): Promise<number> {
  try {
    let cleanedCount = 0;

    // Get all jobs in the queue
    const jobs = await schedulerQueue.getJobs([
      "delayed",
      "active",
      "waiting",
      "completed",
      "failed",
    ]);

    for (const job of jobs) {
      const state = await job.getState();

      // Remove completed or failed scheduler jobs older than 1 hour
      if (state === "completed" || state === "failed") {
        const jobAge = Date.now() - (job.processedOn || job.timestamp);
        if (jobAge > 3600000) {
          // 1 hour
          await job.remove();
          cleanedCount++;
        }
      }

      // Remove duplicate delayed jobs (keep only the earliest)
      if (state === "delayed") {
        const activeJobId = await getActiveSchedulerJobId();
        if (activeJobId && job.id !== activeJobId) {
          log.warn(`Removing duplicate delayed job: ${job.id}`);
          await job.remove();
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      log.info(`🧹 Cleaned up ${cleanedCount} stale scheduler jobs`);
    }

    return cleanedCount;
  } catch (error) {
    log.error("Failed to cleanup stale jobs:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Validate scheduler state consistency
 * Checks if Redis state matches BullMQ job state
 *
 * @returns true if state is consistent, false otherwise
 */
export async function validateSchedulerState(): Promise<boolean> {
  try {
    const activeJobId = await getActiveSchedulerJobId();
    const nextExecutionAt = await getNextExecutionAt();

    // No active job is valid (idle state)
    if (!activeJobId && !nextExecutionAt) {
      return true;
    }

    // If we have one, we should have both
    if (!activeJobId || !nextExecutionAt) {
      log.warn("Inconsistent scheduler state: missing activeJobId or nextExecutionAt");
      return false;
    }

    // Verify job exists in BullMQ
    const job = await schedulerQueue.getJob(activeJobId);
    if (!job) {
      log.warn(`Active job ${activeJobId} not found in BullMQ queue`);
      return false;
    }

    // Verify job is in delayed state
    const state = await job.getState();
    if (state !== "delayed" && state !== "waiting") {
      log.warn(`Active job ${activeJobId} is in wrong state: ${state}`);
      return false;
    }

    return true;
  } catch (error) {
    log.error("Failed to validate scheduler state:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

