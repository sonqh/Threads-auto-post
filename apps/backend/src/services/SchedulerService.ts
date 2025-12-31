import {
  Post,
  PostStatus,
  SchedulePattern,
  CommentStatus,
  generateContentHash,
} from "../models/Post.js";
import { PostService } from "./PostService.js";
import { postQueue } from "../queue/postQueue.js";
import { idempotencyService } from "./IdempotencyService.js";
import { log } from "../config/logger.js";

export class SchedulerService {
  private postService: PostService;
  private isRunning = false;

  constructor() {
    this.postService = new PostService();
  }

  /**
   * Start the scheduler that checks for scheduled posts every minute
   */
  start(): void {
    if (this.isRunning) {
      log.warn("Scheduler is already running");
      return;
    }

    this.isRunning = true;
    log.success("╔════════════════════════════════════════════╗");
    log.success("║         🕐 SCHEDULER SERVICE STARTED       ║");
    log.success("║   Checking for scheduled posts every 60s   ║");
    log.success("╚════════════════════════════════════════════╝");
    log.success(
      "Scheduler started - checking for scheduled posts every 60 seconds"
    );

    // Run immediately on start
    this.processScheduledPosts().catch((error) => {
      log.error("Error processing scheduled posts:", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Then run every 60 seconds
    setInterval(() => {
      this.processScheduledPosts().catch((error) => {
        log.error("Error processing scheduled posts:", {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      // Also check for failed comments that need retry
      this.processFailedComments().catch((error) => {
        log.error("Error processing failed comments:", {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      // Cleanup expired execution locks
      idempotencyService.cleanupExpiredLocks().catch((error) => {
        log.error("Error cleaning up locks:", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 60000); // 60 seconds
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    log.info("🛑 Scheduler stopped");
  }

  /**
   * Process posts with failed comments that need retry
   */
  private async processFailedComments(): Promise<void> {
    try {
      const maxRetries = parseInt(process.env.COMMENT_MAX_RETRIES || "3", 10);

      // Find published posts with failed comments that haven't exceeded retry limit
      const postsWithFailedComments = await Post.find({
        status: PostStatus.PUBLISHED,
        threadsPostId: { $exists: true, $ne: null },
        commentStatus: CommentStatus.FAILED,
        comment: { $exists: true, $ne: "" },
        commentRetryCount: { $lt: maxRetries },
      }).limit(5);

      if (postsWithFailedComments.length === 0) {
        return;
      }

      log.info(
        `💬 Found ${postsWithFailedComments.length} posts with failed comments to retry`
      );

      for (const post of postsWithFailedComments) {
        try {
          const jobId = `comment-retry-${post._id}-${Date.now()}`;

          await postQueue.add(
            "publish-post",
            {
              postId: post._id,
              commentOnlyRetry: true, // Signal to worker this is comment-only retry
            },
            {
              jobId,
              attempts: 1, // Single attempt for comment retry
            }
          );

          log.info(`💬 Queued comment retry for post ${post._id}`);
        } catch (error) {
          log.error(`Failed to queue comment retry for post ${post._id}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      log.error("Error in processFailedComments:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check for scheduled posts that are due and publish them
   */
  private async processScheduledPosts(): Promise<void> {
    try {
      const now = new Date();
      const timestamp = now.toISOString();

      log.info(`[${timestamp}] 🔍 SCHEDULER RUN - Checking for due posts...`);
      log.info("=".repeat(60));

      // Find all posts with SCHEDULED status that are due
      const scheduledPosts = await Post.find({
        status: PostStatus.SCHEDULED,
        scheduledAt: { $lte: now },
      }).limit(10); // Process max 10 at a time

      // Also find upcoming scheduled posts for info
      const upcomingPosts = await Post.find({
        status: PostStatus.SCHEDULED,
        scheduledAt: { $gt: now },
      }).limit(5);

      log.info(`DATABASE STATUS:`);
      log.info(
        `   Due now (scheduledAt <= ${now.toLocaleTimeString()}): ${
          scheduledPosts.length
        } post(s)`
      );
      log.info(
        `   Upcoming (scheduledAt > now): ${upcomingPosts.length} post(s)`
      );

      if (upcomingPosts.length > 0) {
        log.info(`⏳ Next scheduled posts:`);
        upcomingPosts.forEach((p, i) => {
          const waitTime = p.scheduledAt
            ? Math.ceil((p.scheduledAt.getTime() - now.getTime()) / 1000)
            : 0;
          log.info(`   ${i + 1}. "${p.content.substring(0, 40)}..."`);
          log.info(`       Scheduled: ${p.scheduledAt?.toISOString()} (UTC)`);
          log.info(`       Local: ${p.scheduledAt?.toLocaleString()}`);
          log.info(
            `       Wait time: ${waitTime}s (${Math.floor(
              waitTime / 3600
            )}h ${Math.floor((waitTime % 3600) / 60)}m)`
          );
        });
      }

      if (scheduledPosts.length === 0) {
        log.queue(
          `✓ No posts due right now. Scheduler will check again in 60 seconds.`
        );
        log.info("=".repeat(60));
        return;
      }

      log.success(`\n🎯 PROCESSING ${scheduledPosts.length} post(s):`);
      log.success(
        `Found ${scheduledPosts.length} scheduled post(s) to process`
      );

      for (const post of scheduledPosts) {
        try {
          // Determine if this is a recurring post
          const isRecurring =
            post.scheduleConfig?.pattern &&
            ["WEEKLY", "MONTHLY", "DATE_RANGE"].includes(
              post.scheduleConfig.pattern
            );

          const pattern = post.scheduleConfig?.pattern || "ONCE";
          const postPreview = post.content.substring(0, 40).replace(/\n/g, " ");

          log.info(`📌 Post: ${post._id}`);
          log.info(`Content: "${postPreview}..."`);
          log.info(`Pattern: ${pattern}`);
          log.info(`Scheduled: ${post.scheduledAt?.toLocaleString()}`);

          if (isRecurring) {
            // For recurring posts, calculate next run time and keep post SCHEDULED
            const nextRunTime = this.getNextScheduleTime(post.scheduleConfig!);

            if (nextRunTime <= now) {
              // Time to run
              log.success(
                `        DUE (recurring) - Next: ${nextRunTime.toLocaleString()}`
              );
              log.success(
                `⏰ Publishing recurring post ${post._id} (${pattern})`
              );

              // Add to queue for publishing
              const jobId = `scheduled-${post._id}-${Date.now()}`;
              log.info(`⏳ Queuing... (jobId: ${jobId})`);
              await postQueue.add(
                "publish-post",
                {
                  postId: post._id,
                  accountId: post.threadsAccountId?.toString(), // Pass account ID to worker
                },
                { jobId }
              );

              // Update post with progress tracking
              post.jobId = jobId;
              post.status = PostStatus.PUBLISHING;
              post.publishingProgress = {
                status: "publishing",
                startedAt: new Date(),
                currentStep: "Queued for publishing (recurring)...",
              };

              // Update next scheduled time
              post.scheduledAt = nextRunTime;
              await post.save();
              log.success(
                `        Queued! Next run: ${nextRunTime.toLocaleString()}`
              );
            } else {
              log.info(`Not due yet. Next: ${nextRunTime.toLocaleString()}`);
            }
          } else {
            // For one-time posts (ONCE), publish and mark as published
            log.success(`DUE (one-time)`);
            log.success(`⏰ Publishing one-time scheduled post ${post._id}`);

            // Generate idempotency key to prevent duplicate jobs
            const idempotencyKey = idempotencyService.generateIdempotencyKey(
              post._id.toString(),
              post.scheduledAt
            );

            // Check if post already has this idempotency key (job already created)
            if (post.idempotencyKey === idempotencyKey) {
              log.info(
                `Job already created with key ${idempotencyKey}, skipping`
              );
              continue;
            }

            // Generate content hash for duplicate detection
            post.contentHash = generateContentHash(
              post.content,
              post.imageUrls,
              post.videoUrl
            );

            // Initialize comment status if post has a comment
            if (post.comment && post.comment.trim()) {
              post.commentStatus = CommentStatus.PENDING;
            } else {
              post.commentStatus = CommentStatus.NONE;
            }

            // Add to queue for publishing with idempotent job ID
            const jobId = `scheduled-${post._id}-${
              post.scheduledAt?.getTime() || Date.now()
            }`;
            log.info(`       ⏳ Queuing... (jobId: ${jobId})`);

            try {
              await postQueue.add(
                "publish-post",
                {
                  postId: post._id,
                  accountId: post.threadsAccountId?.toString(), // Pass account ID to worker
                },
                {
                  jobId,
                  attempts: 3,
                  backoff: {
                    type: "exponential",
                    delay: 5000, // 5 second initial delay
                  },
                  removeOnComplete: { age: 86400 }, // Keep completed jobs for 24h
                  removeOnFail: { age: 604800 }, // Keep failed jobs for 7 days
                }
              );
            } catch (queueError: any) {
              // Handle duplicate job ID error gracefully
              if (queueError.message?.includes("already exists")) {
                log.info(`Job ${jobId} already exists in queue, skipping`);
                continue;
              }
              throw queueError;
            }

            // Update post status to reflect it's queued with progress tracking
            post.jobId = jobId;
            post.idempotencyKey = idempotencyKey;
            post.status = PostStatus.PUBLISHING;
            post.publishingProgress = {
              status: "publishing",
              startedAt: new Date(),
              currentStep: "Queued for publishing...",
            };
            await post.save();
            log.success(`Queued!`);
          }
        } catch (error) {
          log.error(`ERROR Processing post ${post._id}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
          log.error(`Failed to process scheduled post ${post._id}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      log.info("\n" + "=".repeat(60) + "\n");
    } catch (error) {
      log.error("Error in processScheduledPosts:", {
        error: error instanceof Error ? error.message : String(error),
      });
      log.info("=".repeat(60) + "\n");
    }
  }

  /**
   * Calculate next run time for recurring schedule
   */
  private getNextScheduleTime(config: any): Date {
    const now = new Date();
    const nextRun = new Date(config.scheduledAt);
    const [hours, minutes] = (config.time || "09:00").split(":").map(Number);

    switch (config.pattern) {
      case SchedulePattern.ONCE:
        return config.scheduledAt;

      case SchedulePattern.WEEKLY: {
        const daysOfWeek = config.daysOfWeek || [1]; // Default: Monday
        // Find next occurrence in specified days of week
        nextRun.setDate(nextRun.getDate() + 1);
        while (!daysOfWeek.includes(nextRun.getDay())) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        nextRun.setHours(hours, minutes, 0, 0);
        return nextRun;
      }

      case SchedulePattern.MONTHLY: {
        const dayOfMonth = config.dayOfMonth || 1;
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(dayOfMonth);
        nextRun.setHours(hours, minutes, 0, 0);
        return nextRun;
      }

      case SchedulePattern.DATE_RANGE: {
        // Daily within date range
        const endDate = config.endDate ? new Date(config.endDate) : null;
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(hours, minutes, 0, 0);

        // If next run is past end date, return end date
        if (endDate && nextRun > endDate) {
          return endDate;
        }
        return nextRun;
      }

      default:
        return config.scheduledAt;
    }
  }
}

export const schedulerService = new SchedulerService();
