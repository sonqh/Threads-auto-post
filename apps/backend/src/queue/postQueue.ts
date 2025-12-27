import { Queue, QueueEvents } from "bullmq";
import { createRedisConnection } from "../config/redis.js";

const connection = createRedisConnection();

export const postQueue = new Queue("post-publishing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 1000,
    },
  },
});

export const queueEvents = new QueueEvents("post-publishing", { connection });

// Log queue events
queueEvents.on("completed", ({ jobId }) => {
  console.log(` Job ${jobId} completed successfully`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);
});

export const schedulePost = async (postId: string, scheduledAt: Date) => {
  const delay = scheduledAt.getTime() - Date.now();

  if (delay < 0) {
    throw new Error("Scheduled time must be in the future");
  }

  const job = await postQueue.add(
    "publish-post",
    { postId },
    {
      delay,
      jobId: `post-${postId}-${Date.now()}`,
    }
  );

  return job.id;
};

export const cancelScheduledPost = async (jobId: string) => {
  const job = await postQueue.getJob(jobId);
  if (job) {
    await job.remove();
  }
};
