import { Post, PostStatus, SchedulePattern } from "../models/Post.js";
import { PostService } from "./PostService.js";
import { postQueue } from "../queue/postQueue.js";
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
    log.success("\n╔════════════════════════════════════════════╗");
    log.success("║         🕐 SCHEDULER SERVICE STARTED        ║");
    log.success("║   Checking for scheduled posts every 60s   ║");
    log.success("╚════════════════════════════════════════════╝\n");
    log.success(
      "🕐 Scheduler started - checking for scheduled posts every 60 seconds"
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
   * Check for scheduled posts that are due and publish them
   */
  private async processScheduledPosts(): Promise<void> {
    try {
      const now = new Date();
      const timestamp = now.toISOString();

      log.info("\n" + "=".repeat(60));
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

      log.info(`\n📊 DATABASE STATUS:`);
      log.info(
        `   Due now (scheduledAt <= ${now.toLocaleTimeString()}): ${
          scheduledPosts.length
        } post(s)`
      );
      log.info(
        `   Upcoming (scheduledAt > now): ${upcomingPosts.length} post(s)`
      );

      if (upcomingPosts.length > 0) {
        log.info(`\n⏳ Next scheduled posts:`);
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
        log.info(
          `\n✓ No posts due right now. Scheduler will check again in 60 seconds.`
        );
        log.info("=".repeat(60) + "\n");
        return;
      }

      log.success(`\n🎯 PROCESSING ${scheduledPosts.length} post(s):`);
      log.success(
        `📋 Found ${scheduledPosts.length} scheduled post(s) to process`
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

          log.info(`\n   📌 Post: ${post._id}`);
          log.info(`       Content: "${postPreview}..."`);
          log.info(`       Pattern: ${pattern}`);
          log.info(`       Scheduled: ${post.scheduledAt?.toLocaleString()}`);

          if (isRecurring) {
            // For recurring posts, calculate next run time and keep post SCHEDULED
            const nextRunTime = this.getNextScheduleTime(post.scheduleConfig!);

            if (nextRunTime <= now) {
              // Time to run
              log.success(
                `       ✅ DUE (recurring) - Next: ${nextRunTime.toLocaleString()}`
              );
              log.success(
                `⏰ Publishing recurring post ${post._id} (${pattern})`
              );

              // Add to queue for publishing
              const jobId = `scheduled-${post._id}-${Date.now()}`;
              log.info(`       ⏳ Queuing... (jobId: ${jobId})`);
              await postQueue.add(
                "publish-post",
                { postId: post._id },
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
                `       ✅ Queued! Next run: ${nextRunTime.toLocaleString()}`
              );
            } else {
              log.info(
                `       ⏭️  Not due yet. Next: ${nextRunTime.toLocaleString()}`
              );
            }
          } else {
            // For one-time posts (ONCE), publish and mark as published
            log.success(`       ✅ DUE (one-time)`);
            log.success(`⏰ Publishing one-time scheduled post ${post._id}`);

            // Add to queue for publishing
            const jobId = `scheduled-${post._id}-${Date.now()}`;
            log.info(`       ⏳ Queuing... (jobId: ${jobId})`);
            await postQueue.add(
              "publish-post",
              { postId: post._id },
              { jobId }
            );

            // Update post status to reflect it's queued with progress tracking
            post.jobId = jobId;
            post.status = PostStatus.PUBLISHING;
            post.publishingProgress = {
              status: "publishing",
              startedAt: new Date(),
              currentStep: "Queued for publishing...",
            };
            await post.save();
            log.success(`       ✅ Queued!`);
          }
        } catch (error) {
          log.error(`\n   ❌ ERROR Processing post ${post._id}:`, {
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
