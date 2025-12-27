import { Worker } from "bullmq";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database.js";
import { createRedisConnection } from "./config/redis.js";
import {
  Post,
  PostStatus,
  CommentStatus,
  generateContentHash,
} from "./models/Post.js";
import { ThreadsAdapter } from "./adapters/ThreadsAdapter.js";
import { schedulerService } from "./services/SchedulerService.js";
import { idempotencyService } from "./services/IdempotencyService.js";
import { log } from "./config/logger.js";

dotenv.config();

const connection = createRedisConnection();
const threadsAdapter = new ThreadsAdapter();
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

const worker = new Worker(
  "post-publishing",
  async (job) => {
    const { postId, commentOnlyRetry } = job.data;

    log.info(
      `📤 Processing ${
        commentOnlyRetry ? "comment retry for" : "post"
      } ${postId}...`
    );

    try {
      // ===== Step 1: Pre-publish checks =====
      const canPublishResult = await idempotencyService.canPublish(postId);

      if (!canPublishResult.canPublish) {
        // Check if this is a comment-only retry for an already published post
        if (
          canPublishResult.reason === "Post already published" &&
          commentOnlyRetry
        ) {
          log.info(`📝 Comment-only retry for published post ${postId}`);
          // Fall through to comment retry logic below
        } else {
          log.info(`⏭️  Skipping post ${postId}: ${canPublishResult.reason}`);
          return {
            success: true,
            skipped: true,
            reason: canPublishResult.reason,
          };
        }
      }

      const post = canPublishResult.post || (await Post.findById(postId));
      if (!post) {
        throw new Error(`Post ${postId} not found`);
      }

      // ===== Step 2: Handle comment-only retry =====
      if (
        commentOnlyRetry &&
        post.status === PostStatus.PUBLISHED &&
        post.threadsPostId
      ) {
        return await handleCommentOnlyRetry(post, job);
      }

      // ===== Step 3: Duplicate detection =====
      const duplicateCheck = await idempotencyService.checkForDuplicate(
        post.content,
        post.imageUrls,
        post.videoUrl,
        postId
      );

      if (duplicateCheck.isDuplicate) {
        log.warn(
          `🚫 Duplicate detected for post ${postId}: ${duplicateCheck.message}`
        );
        post.status = PostStatus.FAILED;
        post.error = duplicateCheck.message;
        await post.save();
        return {
          success: false,
          duplicate: true,
          message: duplicateCheck.message,
        };
      }

      // ===== Step 4: Acquire execution lock =====
      const lockResult = await idempotencyService.acquireExecutionLock(
        postId,
        WORKER_ID
      );
      if (!lockResult.acquired) {
        log.warn(
          `⏳ Cannot acquire lock for post ${postId}: ${lockResult.reason}`
        );
        // Don't fail - another worker is processing
        return { success: false, locked: true, reason: lockResult.reason };
      }

      try {
        // ===== Step 5: Update content hash and status =====
        post.contentHash = generateContentHash(
          post.content,
          post.imageUrls,
          post.videoUrl
        );
        post.status = PostStatus.PUBLISHING;
        post.publishingProgress = {
          status: "publishing",
          startedAt: new Date(),
          currentStep: "Publishing post...",
        };

        // Initialize comment status if post has a comment
        if (post.comment && post.comment.trim()) {
          post.commentStatus = CommentStatus.PENDING;
        }

        await post.save();

        // ===== Step 6: Prepare media URLs =====
        const mediaUrls = post.imageUrls.filter(
          (url) => url && url.trim() !== ""
        );
        const videoUrl =
          post.videoUrl && post.videoUrl.trim() !== ""
            ? post.videoUrl
            : undefined;

        // ===== Step 7: Publish to Threads (post only, handle comment separately) =====
        const result = await threadsAdapter.publishPost({
          content: post.content,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          videoUrl,
          comment: post.comment,
          skipComment: false, // Let adapter handle comment, but track result separately
        });

        if (result.success) {
          // ===== Step 8: Post succeeded - update status =====
          post.status = PostStatus.PUBLISHED;
          post.threadsPostId = result.platformPostId;
          post.publishedAt = new Date();
          post.error = undefined;

          // Track comment status separately
          if (result.commentResult) {
            if (result.commentResult.success) {
              post.commentStatus = CommentStatus.POSTED;
              post.threadsCommentId = result.commentResult.commentId;
              post.commentError = undefined;
            } else {
              // Comment failed but post succeeded - DON'T fail the whole job
              post.commentStatus = CommentStatus.FAILED;
              post.commentError = result.commentResult.error;
              post.commentRetryCount = 1;
              log.warn(
                `⚠️ Post ${postId} published but comment failed: ${result.commentResult.error}`
              );
            }
          } else if (!post.comment) {
            post.commentStatus = CommentStatus.NONE;
          }

          post.publishingProgress = {
            status: "published",
            startedAt: post.publishingProgress?.startedAt,
            completedAt: new Date(),
            currentStep: "Published successfully",
          };

          await post.save();

          log.success(
            ` Post ${postId} published successfully: ${result.platformPostId}`
          );
          return {
            success: true,
            platformPostId: result.platformPostId,
            commentStatus: post.commentStatus,
          };
        } else {
          throw new Error(result.error || "Unknown error");
        }
      } finally {
        // Always release lock
        await idempotencyService.releaseExecutionLock(postId);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.error(`Failed to publish post ${postId}:`, {
        error: errorMessage,
      });

      // Release lock if held
      await idempotencyService.releaseExecutionLock(postId);

      // Rollback mechanism (only for non-published posts)
      const post = await Post.findById(postId);
      if (post && post.status !== PostStatus.PUBLISHED) {
        const wasScheduled = post.scheduleConfig && post.scheduledAt;
        const maxAttempts = job.opts.attempts || 3;

        if (wasScheduled && job.attemptsMade < maxAttempts) {
          // Rollback to SCHEDULED for retry
          post.status = PostStatus.SCHEDULED;
          post.error = `Failed attempt ${job.attemptsMade}/${maxAttempts}: ${errorMessage}`;
          log.warn(`Rolling back post ${postId} to SCHEDULED status`, {
            attempt: job.attemptsMade,
            maxAttempts,
          });
        } else {
          // Mark as FAILED (max retries reached or manual post)
          post.status = PostStatus.FAILED;
          post.error = errorMessage;
          log.error(`Marking post ${postId} as FAILED`);
        }

        post.publishingProgress = {
          status: "failed",
          startedAt: post.publishingProgress?.startedAt,
          completedAt: new Date(),
          currentStep: "Publishing failed",
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

/**
 * Handle comment-only retry for posts that published successfully but comment failed
 */
async function handleCommentOnlyRetry(post: any, job: any) {
  const postId = post._id.toString();
  log.info(`💬 Retrying comment for published post ${postId}`);

  if (!post.threadsPostId) {
    throw new Error("Cannot retry comment - post has no threadsPostId");
  }

  if (!post.comment) {
    post.commentStatus = CommentStatus.NONE;
    await post.save();
    return { success: true, skipped: true, reason: "No comment to post" };
  }

  // Check retry limit
  const maxRetries = parseInt(process.env.COMMENT_MAX_RETRIES || "3", 10);
  if ((post.commentRetryCount || 0) >= maxRetries) {
    log.error(`Comment retry limit reached for post ${postId}`);
    return { success: false, reason: "Comment retry limit reached" };
  }

  post.commentStatus = CommentStatus.POSTING;
  post.commentRetryCount = (post.commentRetryCount || 0) + 1;
  await post.save();

  try {
    // Use the stored threadsPostId (origin post ID) for comment
    const commentResult = await threadsAdapter.publishComment(
      post.threadsPostId,
      post.comment
    );

    if (commentResult.success) {
      post.commentStatus = CommentStatus.POSTED;
      post.threadsCommentId = commentResult.commentId;
      post.commentError = undefined;
      await post.save();

      log.success(`💬 Comment retry succeeded for post ${postId}`);
      return { success: true, commentId: commentResult.commentId };
    } else {
      post.commentStatus = CommentStatus.FAILED;
      post.commentError = commentResult.error;
      await post.save();

      log.warn(
        `⚠️ Comment retry failed for post ${postId}: ${commentResult.error}`
      );
      // Don't throw - we don't want to rollback the published post
      return {
        success: false,
        commentFailed: true,
        error: commentResult.error,
      };
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    post.commentStatus = CommentStatus.FAILED;
    post.commentError = errorMessage;
    await post.save();

    log.error(`Comment retry error for post ${postId}: ${errorMessage}`);
    return { success: false, commentFailed: true, error: errorMessage };
  }
}

worker.on("ready", () => {
  log.success("Worker started and ready to process jobs");
});

worker.on("active", (job) => {
  const postId = job.data?.postId;
  log.info(`🟢 Job ${job.id} is ACTIVE - Processing post: ${postId}`);
});

worker.on("progress", (job, progress) => {
  log.info(`Job ${job.id} progress: ${progress}%`);
});

worker.on("failed", (job, err) => {
  const postId = job?.data?.postId;
  log.error(`Job ${job?.id} FAILED for post ${postId}:`, {
    error: err.message,
  });
});

worker.on("completed", (job) => {
  const postId = job.data?.postId;
  log.success(` Job ${job.id} COMPLETED for post: ${postId}`);
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
