import {
  Post,
  PostStatus,
  SchedulePattern,
  CommentStatus,
  generateContentHash,
} from "../models/Post.js";
import { postQueue } from "../queue/postQueue.js";
import {
  schedulerQueue,
  getNextExecutionAt,
  setNextExecutionAt,
  getActiveSchedulerJobId,
  setActiveSchedulerJobId,
  clearSchedulerState,
  withSchedulerLock,
  cleanupStaleJobs,
  validateSchedulerState,
} from "../queue/schedulerQueue.js";
import { idempotencyService } from "./IdempotencyService.js";
import { log } from "../config/logger.js";

const SCHEDULER_JOB_NAME = "check-due-posts";
const BATCH_WINDOW_MS = 5000; // Execute all posts due within 5 seconds

/**
 * Event-driven scheduler that only runs when posts are due
 * No polling - uses BullMQ delayed jobs and event triggers
 */
export class EventDrivenScheduler {
  private isInitialized = false;

  /**
   * Initialize scheduler on server startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      log.warn("Event-driven scheduler already initialized");
      return;
    }

    log.success("╔════════════════════════════════════════════╗");
    log.success("║    🚀 EVENT-DRIVEN SCHEDULER STARTING      ║");
    log.success("║  Zero-polling, Redis-backed scheduling    ║");
    log.success("╚════════════════════════════════════════════╝");

    // Restore scheduler state from Redis
    await this.restoreSchedulerState();

    this.isInitialized = true;
    log.success("✅ Event-driven scheduler initialized");
  }

  /**
   * Restore scheduler state after restart
   * This ensures no scheduled posts are missed
   */
  private async restoreSchedulerState(): Promise<void> {
    try {
      log.info("🔄 Restoring scheduler state from Redis...");

      // 🐛 BUG FIX #4: Clean up stale jobs on initialization
      const cleanedCount = await cleanupStaleJobs();
      if (cleanedCount > 0) {
        log.info(`✓ Cleaned up ${cleanedCount} stale jobs`);
      }

      // Validate scheduler state consistency
      const isValid = await validateSchedulerState();
      if (!isValid) {
        log.warn("⚠️  Scheduler state inconsistent, clearing and rebuilding...");
        await clearSchedulerState();
      }

      // Check if there's an active scheduler job
      const activeJobId = await getActiveSchedulerJobId();
      const nextExecAt = await getNextExecutionAt();

      if (activeJobId) {
        const job = await schedulerQueue.getJob(activeJobId);

        if (job && (await job.getState()) === "delayed") {
          log.info(`✓ Found active scheduler job: ${activeJobId}`);
          log.info(
            `  Next execution: ${new Date(nextExecAt || 0).toISOString()}`
          );
          return;
        }

        // Job doesn't exist or isn't delayed - recreate it
        log.warn("⚠️  Scheduler job missing or in wrong state, recreating...");
      }

      // Find next scheduled post
      await this.scheduleNextCheck();
    } catch (error) {
      log.error("Failed to restore scheduler state:", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: schedule a check immediately
      await this.scheduleImmediateCheck();
    }
  }

  /**
   * Main method: Process all posts that are due now
   * This is called by the BullMQ worker when the delayed job executes
   */
  async processDuePosts(): Promise<void> {
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + BATCH_WINDOW_MS);

      log.info("═".repeat(60));
      log.info(`🔍 SCHEDULER CHECK - ${now.toISOString()}`);

      // 🐛 BUG FIX #5: Add defensive status check to prevent re-processing
      // Only query posts with SCHEDULED status to avoid re-processing posts
      // that are already in PUBLISHING or PUBLISHED state
      const duePosts = await Post.find({
        status: PostStatus.SCHEDULED, // ✅ Explicitly filter for SCHEDULED only
        scheduledAt: {
          $lte: windowEnd, // Posts scheduled up to windowEnd (now + 5s)
        },
      }).sort({ scheduledAt: 1 });

      if (duePosts.length === 0) {
        log.info("✓ No posts due in this window");
      } else {
        log.success(`📬 Found ${duePosts.length} post(s) to process`);

        for (const post of duePosts) {
          try {
            await this.processPost(post);
          } catch (postError) {
            // 🐛 BUG FIX #6: Don't let one post failure stop others
            log.error(`Failed to process post ${post._id}:`, {
              error: postError instanceof Error ? postError.message : String(postError),
            });
            // Continue processing other posts
          }
        }
      }

      // Schedule next check based on upcoming posts
      await this.scheduleNextCheck();

      log.info("═".repeat(60));
    } catch (error) {
      log.error("Error processing due posts:", {
        error: error instanceof Error ? error.message : String(error),
      });

      // 🐛 BUG FIX #6: Improved error recovery
      try {
        // On error, schedule next check in 60 seconds as fallback
        await this.scheduleCheckAt(new Date(Date.now() + 60000));
      } catch (scheduleError) {
        log.error("Failed to schedule fallback check:", {
          error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError),
        });
        // 🐛 BUG FIX #7: Clear Redis state if we can't recover
        await clearSchedulerState();
      }
    }
  }

  /**
   * Process a single scheduled post
   */
  private async processPost(post: any): Promise<void> {
    try {
      const isRecurring =
        post.scheduleConfig?.pattern &&
        ["WEEKLY", "MONTHLY", "DATE_RANGE"].includes(
          post.scheduleConfig.pattern
        );

      const postPreview = post.content.substring(0, 40).replace(/\n/g, " ");
      log.info(`📌 ${post._id}: "${postPreview}..."`);

      if (isRecurring) {
        // For recurring posts, publish and reschedule
        await this.handleRecurringPost(post);
      } else {
        // For one-time posts, publish once
        await this.handleOneTimePost(post);
      }
    } catch (error) {
      log.error(`Failed to process post ${post._id}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle one-time scheduled post
   */
  private async handleOneTimePost(post: any): Promise<void> {
    // Generate idempotency key
    const idempotencyKey = idempotencyService.generateIdempotencyKey(
      post._id.toString(),
      post.scheduledAt
    );

    // // Check if already processed (skip if idempotency is enabled)
    // if (idempotencyKey && post.idempotencyKey === idempotencyKey) {
    //   log.info(
    //     `  ⏭️  Post already queued for publishing. Skipping duplicate job creation.`
    //   );
    //   return;
    // }

    // Generate content hash for duplicate detection
    post.contentHash = generateContentHash(
      post.content,
      post.imageUrls,
      post.videoUrl
    );

    // Initialize comment status
    if (post.comment?.trim()) {
      post.commentStatus = CommentStatus.PENDING;
    } else {
      post.commentStatus = CommentStatus.NONE;
    }

    // Create job ID
    const jobId = `scheduled-${post._id}-${
      post.scheduledAt?.getTime() || Date.now()
    }`;

    try {
      // Add to publishing queue - IMPORTANT: Include accountId in job data
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
            delay: 5000,
          },
          removeOnComplete: { age: 86400 },
          removeOnFail: { age: 604800 },
        }
      );

      // Update post status
      post.jobId = jobId;
      if (idempotencyKey) {
        post.idempotencyKey = idempotencyKey;
      }
      post.status = PostStatus.PUBLISHING;
      post.publishingProgress = {
        status: "publishing",
        startedAt: new Date(),
        currentStep: "Queued for publishing...",
      };
      await post.save();

      log.success(
        `  ✅ Queued (${jobId}) for account: ${
          post.threadsAccountId || "default"
        }`
      );
    } catch (queueError: any) {
      if (queueError.message?.includes("already exists")) {
        log.info(`  ⏭️  Job already exists in queue`);
      } else {
        throw queueError;
      }
    }
  }

  /**
   * Handle recurring scheduled post
   * 🐛 BUG FIX #3: Keep post as SCHEDULED instead of PUBLISHING
   * This allows the next occurrence to be found by the scheduler
   */
  private async handleRecurringPost(post: any): Promise<void> {
    const nextRunTime = this.getNextScheduleTime(post.scheduleConfig);
    const now = new Date();

    if (nextRunTime > now) {
      log.info(`  ⏰ Not due yet, next: ${nextRunTime.toISOString()}`);
      return;
    }

    // Time to publish
    const jobId = `scheduled-${post._id}-${Date.now()}`;

    try {
      // IMPORTANT: Include accountId in job data for recurring posts too
      await postQueue.add(
        "publish-post",
        {
          postId: post._id,
          accountId: post.threadsAccountId?.toString(),
        },
        { jobId }
      );

      // 🐛 BUG FIX #3: Keep status as SCHEDULED for recurring posts
      // The worker will update to PUBLISHING -> PUBLISHED during execution
      // But we need to keep the post in SCHEDULED state with updated scheduledAt
      // so the next occurrence can be found by the scheduler
      post.jobId = jobId;
      post.scheduledAt = nextRunTime; // Update to next occurrence time
      // ✅ Keep status as SCHEDULED, don't change to PUBLISHING
      // post.status = PostStatus.PUBLISHING; // ❌ OLD BUGGY CODE
      await post.save();

      log.success(
        `  ✅ Queued (recurring) for account: ${
          post.threadsAccountId || "default"
        }, next: ${nextRunTime.toISOString()}`
      );
    } catch (queueError: any) {
      if (queueError.message?.includes("already exists")) {
        log.info(`  ⏭️  Job already exists`);
      } else {
        throw queueError;
      }
    }
  }

  /**
   * Calculate next run time for recurring posts
   */
  private getNextScheduleTime(config: any): Date {
    const now = new Date();
    const nextRun = new Date(config.scheduledAt);
    const [hours, minutes] = (config.time || "09:00").split(":").map(Number);

    switch (config.pattern) {
      case SchedulePattern.ONCE:
        return config.scheduledAt;

      case SchedulePattern.WEEKLY: {
        const daysOfWeek = config.daysOfWeek || [1];
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
        const endDate = config.endDate ? new Date(config.endDate) : null;
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(hours, minutes, 0, 0);

        if (endDate && nextRun > endDate) {
          return endDate;
        }
        return nextRun;
      }

      default:
        return config.scheduledAt;
    }
  }

  /**
   * Schedule the next scheduler check based on earliest due post
   */
  async scheduleNextCheck(): Promise<void> {
    try {
      // Find the earliest scheduled post
      const earliestPost = await Post.findOne({
        status: PostStatus.SCHEDULED,
      }).sort({ scheduledAt: 1 });

      if (!earliestPost?.scheduledAt) {
        log.info("📭 No upcoming scheduled posts");
        await clearSchedulerState();
        return;
      }

      const nextCheckTime = earliestPost.scheduledAt;
      await this.scheduleCheckAt(nextCheckTime);
    } catch (error) {
      log.error("Failed to schedule next check:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Schedule a check at a specific time
   * 🐛 BUG FIX #1: Use distributed lock to prevent race conditions
   */
  private async scheduleCheckAt(checkTime: Date): Promise<void> {
    const now = Date.now();
    const checkTimestamp = checkTime.getTime();
    const delay = Math.max(0, checkTimestamp - now);

    // 🐛 BUG FIX #1: Execute with distributed lock for atomic operation
    const result = await withSchedulerLock(async () => {
      try {
        // Remove existing scheduler job if any
        const existingJobId = await getActiveSchedulerJobId();
        if (existingJobId) {
          const existingJob = await schedulerQueue.getJob(existingJobId);
          if (existingJob) {
            await existingJob.remove();
            log.info(`Removed previous scheduler job: ${existingJobId}`);
          }
        }

        // Create new scheduler job
        const jobId = `scheduler-check-${checkTimestamp}`;
        await schedulerQueue.add(
          SCHEDULER_JOB_NAME,
          { checkTime: checkTimestamp },
          {
            jobId,
            delay,
            attempts: 3,
            removeOnComplete: { count: 5 },
            removeOnFail: { count: 10 },
          }
        );

        // Persist state
        await setNextExecutionAt(checkTimestamp);
        await setActiveSchedulerJobId(jobId);

        const delaySeconds = Math.floor(delay / 1000);
        log.info(
          `⏰ Next check scheduled in ${delaySeconds}s at ${checkTime.toISOString()}`
        );

        return true;
      } catch (error) {
        log.error("Failed to schedule check:", {
          error: error instanceof Error ? error.message : String(error),
        });
        // 🐛 BUG FIX #7: Clear state on failure
        await clearSchedulerState();
        throw error;
      }
    });

    if (result === null) {
      log.warn("Could not acquire scheduler lock, another instance may be scheduling");
    }
  }

  /**
   * Schedule an immediate check (used on startup or after errors)
   */
  async scheduleImmediateCheck(): Promise<void> {
    await this.scheduleCheckAt(new Date(Date.now() + 1000));
  }

  /**
   * EVENT HANDLERS
   * These are called when posts are created/updated/deleted
   */

  /**
   * Called when a post is scheduled (created or rescheduled)
   * 🐛 BUG FIX #2: Improved error handling in event handler
   */
  async onPostScheduled(postId: string, scheduledAt: Date): Promise<void> {
    try {
      log.info(
        `📅 Event: Post ${postId} scheduled for ${scheduledAt.toISOString()}`
      );

      const currentNextExec = await getNextExecutionAt();

      // If this post is due before the current next execution, reschedule
      if (!currentNextExec || scheduledAt.getTime() < currentNextExec) {
        log.info("🔄 Rescheduling: New post is due earlier");
        await this.scheduleNextCheck();
      } else {
        log.info(
          `✓ Post scheduled for ${scheduledAt.toISOString()} (after current next check)`
        );
      }
    } catch (error) {
      log.error("Failed to handle onPostScheduled event:", {
        error: error instanceof Error ? error.message : String(error),
        postId,
        scheduledAt: scheduledAt.toISOString(),
      });
      // Don't throw - this is an event handler, we don't want to break the caller
      // Schedule an immediate check as fallback
      try {
        await this.scheduleImmediateCheck();
      } catch (fallbackError) {
        log.error("Failed to schedule fallback check:", {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }
    }
  }

  /**
   * Called when a scheduled post is cancelled or deleted
   * 🐛 BUG FIX #2: Improved error handling in event handler
   */
  async onPostCancelled(postId: string): Promise<void> {
    try {
      log.info(`🗑️  Event: Post ${postId} cancelled`);

      // If the cancelled post was the next scheduled post, find new next post
      const currentNextExec = await getNextExecutionAt();
      const earliestPost = await Post.findOne({
        status: PostStatus.SCHEDULED,
      }).sort({ scheduledAt: 1 });

      if (
        !earliestPost ||
        !earliestPost.scheduledAt ||
        (currentNextExec &&
          earliestPost.scheduledAt.getTime() !== currentNextExec)
      ) {
        log.info("🔄 Rescheduling: Next post changed after cancellation");
        await this.scheduleNextCheck();
      } else {
        log.info("✓ No reschedule needed, next post unchanged");
      }
    } catch (error) {
      log.error("Failed to handle onPostCancelled event:", {
        error: error instanceof Error ? error.message : String(error),
        postId,
      });
      // Don't throw - schedule fallback check
      try {
        await this.scheduleNextCheck();
      } catch (fallbackError) {
        log.error("Failed to schedule fallback check:", {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }
    }
  }

  /**
   * Process failed comments (can run periodically or be event-triggered)
   */
  async processFailedComments(): Promise<void> {
    try {
      const maxRetries = parseInt(process.env.COMMENT_MAX_RETRIES || "3", 10);

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

      log.info(`💬 Retrying ${postsWithFailedComments.length} failed comments`);

      for (const post of postsWithFailedComments) {
        try {
          const jobId = `comment-retry-${post._id}-${Date.now()}`;
          await postQueue.add(
            "publish-post",
            {
              postId: post._id,
              commentOnlyRetry: true,
            },
            {
              jobId,
              attempts: 1,
            }
          );

          log.info(`💬 Queued comment retry for ${post._id}`);
        } catch (error) {
          log.error(`Failed to queue comment retry for ${post._id}:`, {
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
}

export const eventDrivenScheduler = new EventDrivenScheduler();
