import { Worker } from "bullmq";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database.js";
import { createRedisConnection } from "./config/redis.js";
import { Post, PostStatus } from "./models/Post.js";
import { ThreadsAdapter } from "./adapters/ThreadsAdapter.js";
import { schedulerService } from "./services/SchedulerService.js";
import { log } from "./config/logger.js";

dotenv.config();

const connection = createRedisConnection();
const threadsAdapter = new ThreadsAdapter();

const worker = new Worker(
  "post-publishing",
  async (job) => {
    const { postId } = job.data;

    log.info(`📤 Processing post ${postId}...`);

    try {
      const post = await Post.findById(postId);

      if (!post) {
        throw new Error(`Post ${postId} not found`);
      }

      // Check if post is already published
      if (post.status === PostStatus.PUBLISHED && post.threadsPostId) {
        log.info(
          `⏭️  Post ${postId} already published with ID ${post.threadsPostId}, skipping`
        );
        return {
          success: true,
          skipped: true,
          platformPostId: post.threadsPostId,
        };
      }

      // Check if post was published recently (within last 24 hours) to prevent duplicates
      if (post.publishedAt) {
        const hoursSincePublish =
          (Date.now() - post.publishedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSincePublish < 24) {
          log.warn(
            `⚠️  Post ${postId} was already published ${hoursSincePublish.toFixed(
              1
            )}h ago, preventing duplicate`
          );
          post.status = PostStatus.PUBLISHED;
          await post.save();
          return {
            success: true,
            skipped: true,
            alreadyPublishedRecently: true,
            platformPostId: post.threadsPostId,
          };
        }
      }

      // Prepare media URLs
      const mediaUrls = post.imageUrls.filter(
        (url) => url && url.trim() !== ""
      );
      const videoUrl =
        post.videoUrl && post.videoUrl.trim() !== ""
          ? post.videoUrl
          : undefined;

      // Publish to Threads
      const result = await threadsAdapter.publishPost({
        content: post.content,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        videoUrl,
        comment: post.comment, // Pass comment field
      });

      if (result.success) {
        post.status = PostStatus.PUBLISHED;
        post.threadsPostId = result.platformPostId;
        post.publishedAt = new Date();
        post.error = undefined;
        await post.save();

        log.success(
          `✅ Post ${postId} published successfully: ${result.platformPostId}`
        );
        return { success: true, platformPostId: result.platformPostId };
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.error(`❌ Failed to publish post ${postId}:`, {
        error: errorMessage,
      });

      // Rollback mechanism: revert post status
      const post = await Post.findById(postId);
      if (post) {
        // IMPORTANT: Don't rollback if post was already successfully published
        // This prevents duplicates when server restarts or jobs retry
        if (post.status === PostStatus.PUBLISHED && post.threadsPostId) {
          log.info(`ℹ️  Post ${postId} is already published, not rolling back`);
          return; // Don't throw error, job succeeded
        }

        // Check if post was originally scheduled
        const wasScheduled = post.scheduleConfig && post.scheduledAt;

        if (wasScheduled) {
          // Only rollback if not already at max attempts
          if (job.attemptsMade < (job.opts.attempts || 3)) {
            // Rollback to SCHEDULED status for retry
            post.status = PostStatus.SCHEDULED;
            post.error = `Failed attempt ${job.attemptsMade}/${job.opts.attempts}: ${errorMessage}`;
            log.warn(`🔄 Rolling back post ${postId} to SCHEDULED status`, {
              originalSchedule: post.scheduledAt?.toISOString(),
              attempt: job.attemptsMade,
            });
          } else {
            // Max attempts reached, mark as failed
            post.status = PostStatus.FAILED;
            post.error = `All ${job.attemptsMade} attempts failed: ${errorMessage}`;
            log.error(
              `❌ Max attempts reached, marking post ${postId} as FAILED`
            );
          }
        } else {
          // Mark as FAILED for manual posts
          post.status = PostStatus.FAILED;
          post.error = errorMessage;
          log.error(`❌ Marking post ${postId} as FAILED`);
        }

        // Clear publishing progress
        post.publishingProgress = {
          status: "failed",
          startedAt: post.publishingProgress?.startedAt,
          completedAt: new Date(),
          currentStep:
            post.publishingProgress?.currentStep || "Publishing failed",
          error: errorMessage,
        };

        await post.save();
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000, // 10 requests per minute
    },
  }
);

worker.on("ready", () => {
  log.success("🔄 Worker started and ready to process jobs");
});

worker.on("active", (job) => {
  const postId = job.data?.postId;
  log.info(`🟢 Job ${job.id} is ACTIVE - Processing post: ${postId}`);
});

worker.on("progress", (job, progress) => {
  log.info(`📊 Job ${job.id} progress: ${progress}%`);
});

worker.on("failed", (job, err) => {
  const postId = job?.data?.postId;
  log.error(`❌ Job ${job?.id} FAILED for post ${postId}:`, {
    error: err.message,
  });
});

worker.on("completed", (job) => {
  const postId = job.data?.postId;
  log.success(`✅ Job ${job.id} COMPLETED for post: ${postId}`);
});

const startWorker = async () => {
  try {
    await connectDatabase();
    log.success("🚀 Worker is running...");

    // Start the scheduler for scheduled posts
    schedulerService.start();
  } catch (error) {
    log.error("Failed to start worker:", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

startWorker();
