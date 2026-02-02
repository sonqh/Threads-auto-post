import { Worker } from "bullmq";
import dotenv from "dotenv";
import axios from "axios";
import { connectDatabase } from "./config/database.js";
import { createRedisConnection } from "./config/redis.js";
import {
  Post,
  PostStatus,
  CommentStatus,
  generateContentHash,
} from "./models/Post.js";
import { ThreadsAdapter } from "./adapters/ThreadsAdapter.js";
import { ThreadsService } from "./services/ThreadsService.js";
import { schedulerService } from "./services/SchedulerService.js";
import { eventDrivenScheduler } from "./services/EventDrivenScheduler.js";
import { idempotencyService } from "./services/IdempotencyService.js";
import { postQueue } from "./queue/postQueue.js";
import { log } from "./config/logger.js";

dotenv.config();

const connection = createRedisConnection();
const threadsService = new ThreadsService();
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

/**
 * Error categories for intelligent error handling
 */
enum ErrorCategory {
  FATAL = "FATAL",           // Can't retry: invalid content, expired token, permanent API errors
  RETRYABLE = "RETRYABLE",   // Can retry: rate limit, temporary issues, invalid URLs (user can fix)
  TRANSIENT = "TRANSIENT",   // Automatic retry: network issues, 5xx server errors
}

interface ErrorClassification {
  category: ErrorCategory;
  shouldRollback: boolean;
  message: string;
  suggestedAction: string;
}

/**
 * Classify errors to determine appropriate handling
 * @param error - The error to classify
 * @returns Classification with category, rollback decision, and user-facing messages
 */
function classifyError(error: any): ErrorClassification {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const apiError = error.response?.data?.error;
    const errorCode = apiError?.code;
    const errorMessage = apiError?.message || error.message;

    log.debug("Classifying API error:", {
      status,
      errorCode,
      errorMessage: errorMessage?.substring(0, 100),
    });

    // ========== 400 Bad Request - Classify based on error code ==========
    if (status === 400) {
      // FATAL: Token expired (code 190)
      if (errorCode === 190) {
        return {
          category: ErrorCategory.FATAL,
          shouldRollback: false,
          message: "Access token has expired",
          suggestedAction:
            "Please refresh your Threads access token in the Accounts settings. Your token needs to be renewed to continue posting.",
        };
      }

      // RETRYABLE: Invalid image URL (code 100)
      if (errorCode === 100 && errorMessage.toLowerCase().includes("image")) {
        return {
          category: ErrorCategory.RETRYABLE,
          shouldRollback: true,
          message: "Invalid image URL or image failed to download",
          suggestedAction:
            "Please check that your image URLs are publicly accessible, under 8MB, and in a supported format (JPEG, PNG, GIF, WebP). You can edit the post and try again.",
        };
      }

      // RETRYABLE: Invalid video URL (code 100)
      if (errorCode === 100 && errorMessage.toLowerCase().includes("video")) {
        return {
          category: ErrorCategory.RETRYABLE,
          shouldRollback: true,
          message: "Invalid video URL or video failed to download",
          suggestedAction:
            "Please check that your video URL is publicly accessible, under size limits, and in a supported format (MP4, MOV). You can edit the post and try again.",
        };
      }

      // RETRYABLE: Rate limit (code 4 or 17)
      if (
        errorCode === 4 ||
        errorCode === 17 ||
        errorMessage.toLowerCase().includes("rate limit") ||
        errorMessage.toLowerCase().includes("too many")
      ) {
        return {
          category: ErrorCategory.RETRYABLE,
          shouldRollback: true,
          message: "Rate limit reached",
          suggestedAction:
            "You've hit Threads API rate limits. Scheduled posts will be retried automatically. For manual posts, please wait a few minutes before trying again.",
        };
      }

      // RETRYABLE: Content too long
      if (
        errorMessage.toLowerCase().includes("text") &&
        (errorMessage.toLowerCase().includes("long") ||
          errorMessage.toLowerCase().includes("exceeds"))
      ) {
        return {
          category: ErrorCategory.RETRYABLE,
          shouldRollback: true,
          message: "Content exceeds maximum length",
          suggestedAction:
            "Threads posts are limited to 500 characters. Please edit your post to make it shorter, then try again.",
        };
      }

      // RETRYABLE: Default 400 - treat as fixable by user
      return {
        category: ErrorCategory.RETRYABLE,
        shouldRollback: true,
        message: errorMessage || "Invalid request to Threads API",
        suggestedAction:
          "There was an issue with your post content or settings. Please review and edit the post, then try publishing again. If the problem persists, check the Threads API documentation.",
      };
    }

    // ========== 401 Unauthorized ==========
    if (status === 401) {
      return {
        category: ErrorCategory.FATAL,
        shouldRollback: false,
        message: "Authentication failed",
        suggestedAction:
          "Your Threads credentials are invalid. Please update your access token in the Accounts settings.",
      };
    }

    // ========== 403 Forbidden ==========
    if (status === 403) {
      return {
        category: ErrorCategory.FATAL,
        shouldRollback: false,
        message: "Permission denied",
        suggestedAction:
          "Your account doesn't have permission to perform this action. Please check your Threads account settings and API permissions.",
      };
    }

    // ========== 429 Too Many Requests ==========
    if (status === 429) {
      return {
        category: ErrorCategory.RETRYABLE,
        shouldRollback: true,
        message: "Too many requests - rate limited",
        suggestedAction:
          "You've made too many requests to the Threads API. Scheduled posts will retry automatically. Please wait before posting manually.",
      };
    }

    // ========== 5xx Server Errors - Always transient ==========
    if (status && status >= 500 && status < 600) {
      return {
        category: ErrorCategory.TRANSIENT,
        shouldRollback: true,
        message: "Threads server error",
        suggestedAction:
          "The Threads API is experiencing issues. This post will be retried automatically. No action needed from you.",
      };
    }

    // ========== Network/Timeout Errors ==========
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return {
        category: ErrorCategory.TRANSIENT,
        shouldRollback: true,
        message: "Network timeout",
        suggestedAction:
          "Connection to Threads API timed out. This is usually temporary and the post will be retried automatically.",
      };
    }
  }

  // ========== Unknown errors - Default to retryable ==========
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    category: ErrorCategory.RETRYABLE,
    shouldRollback: true,
    message: errorMessage,
    suggestedAction:
      "An unexpected error occurred. You can try editing and republishing this post. If the issue persists, please contact support.",
  };
}

const worker = new Worker(
  "post-publishing",
  async (job) => {
    const { postId, commentOnlyRetry, accountId } = job.data;

    log.info(
      `📤 Processing ${commentOnlyRetry ? "comment retry for" : "post"
      } ${postId}...`,
      { accountId: accountId || "from-post" }
    );

    try {
      // ===== Step 1: Pre-publish checks =====
      // COMMENTED OUT: All idempotency checks disabled
      // const canPublishResult = await idempotencyService.canPublish(postId);
      // if (!canPublishResult.canPublish) {
      //   if (
      //     canPublishResult.reason === "Post already published" &&
      //     commentOnlyRetry
      //   ) {
      //     log.info(`Comment-only retry for published post ${postId}`);
      //   } else {
      //     log.info(`Skipping post ${postId}: ${canPublishResult.reason}`);
      //     return {
      //       success: true,
      //       skipped: true,
      //       reason: canPublishResult.reason,
      //     };
      //   }
      // }

      const post = await Post.findById(postId);
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
      // COMMENTED OUT: Duplicate detection disabled
      // const duplicateCheck = await idempotencyService.checkForDuplicate(
      //   post.content,
      //   post.imageUrls,
      //   post.videoUrl,
      //   postId
      // );
      // if (duplicateCheck.isDuplicate) {
      //   log.warn(
      //     `🚫 Duplicate detected for post ${postId}: ${duplicateCheck.message}`
      //   );
      //   const freshPost = await Post.findById(postId);
      //   if (freshPost) {
      //     freshPost.status = PostStatus.FAILED;
      //     freshPost.error = duplicateCheck.message;
      //     await freshPost.save();
      //   }
      //   return {
      //     success: false,
      //     duplicate: true,
      //     message: duplicateCheck.message,
      //   };
      // }

      // Second check: Content posted recently (within idempotency window for safety)
      // COMMENTED OUT: Recent content check disabled
      // const recentContentCheck =
      //   await idempotencyService.checkRecentPostContent(
      //     post.content,
      //     post.imageUrls,
      //     post.videoUrl,
      //     postId
      //   );
      // if (recentContentCheck.isDuplicate) {
      //   log.warn(
      //     `🚫 Recent duplicate content detected for post ${postId}: ${recentContentCheck.message}`
      //   );
      //   const freshPost = await Post.findById(postId);
      //   if (freshPost) {
      //     freshPost.status = PostStatus.FAILED;
      //     freshPost.error = recentContentCheck.message;
      //     await freshPost.save();
      //   }
      //   return {
      //     success: false,
      //     duplicate: true,
      //     message: recentContentCheck.message,
      //   };
      // }

      // ===== Step 4: Acquire execution lock =====
      // COMMENTED OUT: Execution lock disabled
      // const lockResult = await idempotencyService.acquireExecutionLock(
      //   postId,
      //   WORKER_ID
      // );
      // if (!lockResult.acquired) {
      //   log.warn(
      //     `⏳ Cannot acquire lock for post ${postId}: ${lockResult.reason}`
      //   );
      //   return { success: false, locked: true, reason: lockResult.reason };
      // }

      try {
        // Refresh post after lock acquisition to get latest version
        let post = await Post.findById(postId);
        if (!post) {
          throw new Error(`Post ${postId} not found after lock`);
        }

        // Ensure new fields have defaults if they don't exist (for existing documents)
        if (!post.commentStatus) {
          post.commentStatus = CommentStatus.NONE;
        }
        if (!post.commentRetryCount) {
          post.commentRetryCount = 0;
        }

        // ===== Step 5: Initialize adapter with correct credentials =====
        // Priority: 1) accountId from job data, 2) post.threadsAccountId
        
        // ✅ PHASE 1: Update progress - Fetching credentials
        post.publishingProgress = {
          status: "publishing",
          startedAt: new Date(),
          currentStep: "Fetching account credentials...",
        };
        await post.save();
        
        const effectiveAccountId =
          accountId || post.threadsAccountId?.toString();
        let adapter = new ThreadsAdapter();

        if (effectiveAccountId) {
          log.info(
            `🔑 Looking up credential for account: ${effectiveAccountId}`
          );
          const credential = await threadsService.getCredentialById(
            effectiveAccountId
          );
          if (credential) {
            adapter = new ThreadsAdapter(
              credential.threadsUserId,
              credential.accessToken
            );
            log.info(
              `✅ Using account ${credential.threadsUserId} (${credential.accountName || "unnamed"
              }) for post ${postId}`
            );
          } else {
            log.error(
              `❌ Credential ${effectiveAccountId} not found! Falling back to default .env credentials`
            );
            // Don't silently fail - log clearly that we're using fallback
          }
        } else {
          log.warn(
            `⚠️ No account specified for post ${postId}, using default .env credentials`
          );
        }

        // ===== Step 6: Update content hash and status =====
        
        // ✅ PHASE 1: Update progress - Validating post
        post.publishingProgress = {
          status: "publishing",
          startedAt: post.publishingProgress?.startedAt || new Date(),
          currentStep: "Validating post content...",
        };
        await post.save();
        
        post.contentHash = generateContentHash(
          post.content,
          post.imageUrls,
          post.videoUrl
        );
        post.status = PostStatus.PUBLISHING;

        // Initialize comment status if post has a comment
        if (post.comment && post.comment.trim()) {
          post.commentStatus = CommentStatus.PENDING;
        }

        await post.save();

        // ===== Step 7: Prepare media URLs =====
        const mediaUrls = post.imageUrls.filter(
          (url) => url && url.trim() !== ""
        );
        const videoUrl =
          post.videoUrl && post.videoUrl.trim() !== ""
            ? post.videoUrl
            : undefined;

        // ✅ PHASE 1: Update progress - Preparing media or publishing
        const hasMedia = mediaUrls.length > 0 || videoUrl;
        post.publishingProgress!.currentStep = hasMedia
          ? `Preparing ${mediaUrls.length > 0 ? mediaUrls.length + ' image(s)' : 'video'}...`
          : "Publishing to Threads...";
        await post.save();

        // ✅ PHASE 2: Create progress callback function
        const updateProgress = async (step: string) => {
          try {
            console.log(`📊 Progress update: ${step}`);
            // Update database in real-time
            await Post.findByIdAndUpdate(postId, {
              "publishingProgress.currentStep": step,
              "publishingProgress.lastUpdated": new Date(),
            });
          } catch (error) {
            // Don't fail the job if progress update fails
            console.error("Failed to update progress:", error);
          }
        };

        // ===== Step 8: Publish to Threads (post only, handle comment separately) =====
        const result = await adapter.publishPost({
          content: post.content,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          videoUrl,
          comment: post.comment,
          skipComment: false, // Let adapter handle comment, but track result separately
          progressCallback: updateProgress, // ✅ PHASE 2: Pass callback
        });

        if (result.success) {
          // ===== Step 9: Post succeeded - update status =====
          
          // ✅ PHASE 1: Update progress - Finalizing
          post.publishingProgress!.currentStep = "Finalizing...";
          await post.save();
          
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
                `Post ${postId} published but comment failed: ${result.commentResult.error}`
              );

              // ===== AUTO-RETRY: Schedule comment retry for server errors =====
              const isServerError =
                result.commentResult.error?.includes("500") ||
                result.commentResult.error?.includes("Internal Server Error") ||
                result.commentResult.error?.includes("unexpected error") ||
                result.commentResult.error?.includes("retry");

              const maxRetries = parseInt(
                process.env.COMMENT_MAX_RETRIES || "3",
                10
              );
              if (isServerError && post.commentRetryCount < maxRetries) {
                const retryDelay = 60000 * post.commentRetryCount; // 1min, 2min, 3min...
                log.info(
                  `📅 Scheduling comment retry in ${retryDelay / 1000
                  }s for post ${postId}`
                );

                await postQueue.add(
                  "publish-post",
                  {
                    postId: post._id.toString(),
                    commentOnlyRetry: true,
                    accountId: post.threadsAccountId?.toString(),
                  },
                  {
                    delay: retryDelay,
                    jobId: `comment-retry-${post._id}-${Date.now()}`,
                    attempts: 1, // Single attempt per retry job
                    removeOnComplete: { age: 3600 },
                    removeOnFail: { age: 86400 },
                  }
                );
                log.success(`✅ Comment retry scheduled for post ${postId}`);
              }
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

          // Save with retry logic to ensure status update persists
          let saveAttempts = 0;
          let saveFailed = false;
          while (saveAttempts < 3) {
            try {
              await post.save();
              log.success(
                ` Post ${postId} published successfully: ${result.platformPostId}`
              );
              return {
                success: true,
                platformPostId: result.platformPostId,
                commentStatus: post.commentStatus,
              };
            } catch (saveError) {
              saveAttempts++;
              const errorMsg =
                saveError instanceof Error
                  ? saveError.message
                  : "Unknown error";
              log.warn(
                `Failed to save post status (attempt ${saveAttempts}/3): ${errorMsg}`
              );
              if (saveAttempts < 3) {
                // Wait before retrying
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          }

          // If we get here, all save attempts failed
          saveFailed = true;
          log.error(
            `Failed to save published post status after 3 attempts. Post has threadsPostId: ${result.platformPostId}`
          );
          throw new Error(
            "Post published successfully but failed to update database status"
          );
        } else {
          throw new Error(result.error || "Unknown error");
        }
      } finally {
        // Always release lock
        // COMMENTED OUT: Lock release disabled
        // await idempotencyService.releaseExecutionLock(postId);
      }
    } catch (error: unknown) {
      // 🎯 SMART ERROR CLASSIFICATION & ROLLBACK
      const classification = classifyError(error);

      log.error(`Failed to publish post ${postId}:`, {
        errorCategory: classification.category,
        errorMessage: classification.message,
        suggestedAction: classification.suggestedAction,
        attemptsMade: job.attemptsMade,
      });

      // Release lock if held
      // COMMENTED OUT: Lock release disabled
      // await idempotencyService.releaseExecutionLock(postId);

      // Smart rollback mechanism
      const post = await Post.findById(postId);
      if (post && post.status !== PostStatus.PUBLISHED) {
        const wasScheduled = post.scheduleConfig && post.scheduledAt;
        const maxAttempts = job.opts.attempts || 3;
        const isRecurring = post.scheduleConfig?.pattern !== "ONCE";

        // Determine target status based on error category and post type
        if (classification.shouldRollback) {
          if (wasScheduled && job.attemptsMade < maxAttempts) {
            // ✅ Scheduled posts: rollback to SCHEDULED for auto-retry
            post.status = PostStatus.SCHEDULED;
            post.error = `${classification.message} (Attempt ${job.attemptsMade}/${maxAttempts})`;
            post.errorCategory = classification.category;
            post.suggestedAction = classification.suggestedAction;
            log.warn(
              `✅ Rolling back scheduled post ${postId} to SCHEDULED for retry`,
              {
                attempt: job.attemptsMade,
                maxAttempts,
                errorCategory: classification.category,
              }
            );
          } else if (!wasScheduled) {
            // ✅ Manual posts: rollback to DRAFT for user to fix and retry
            post.status = PostStatus.DRAFT;
            post.error = classification.message;
            post.errorCategory = classification.category;
            post.suggestedAction = classification.suggestedAction;
            log.warn(
              `✅ Rolling back manual post ${postId} to DRAFT for user retry`,
              {
                errorCategory: classification.category,
                userCanFix: true,
              }
            );
          } else {
            // Max retries reached for scheduled post
            post.status = isRecurring ? PostStatus.SCHEDULED : PostStatus.FAILED;
            post.error = `${classification.message} (Max retries reached: ${maxAttempts})`;
            post.errorCategory = classification.category;
            post.suggestedAction = classification.suggestedAction;
            log.error(
              `❌ Max retries reached for post ${postId}, marking as ${post.status}`,
              {
                maxAttempts,
                isRecurring,
              }
            );
          }

          // Set appropriate publishing progress status
          post.publishingProgress = {
            status: (post.status === PostStatus.DRAFT
              ? "ready_to_retry"
              : "failed") as "ready_to_retry" | "failed" | "pending" | "publishing" | "published",
            startedAt: post.publishingProgress?.startedAt,
            completedAt: new Date(),
            currentStep: classification.message,
            error: classification.message,
          };
        } else {
          // ❌ Fatal errors - don't rollback, mark as FAILED
          post.status = PostStatus.FAILED;
          post.error = classification.message;
          post.errorCategory = classification.category;
          post.suggestedAction = classification.suggestedAction;
          post.publishingProgress = {
            status: "failed",
            startedAt: post.publishingProgress?.startedAt,
            completedAt: new Date(),
            currentStep: "Publishing failed (fatal error)",
            error: classification.message,
          };
          log.error(
            `❌ Fatal error for post ${postId}, marking as FAILED (no rollback)`,
            {
              errorCategory: classification.category,
            }
          );
        }

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
    // Stalled job handling - critical for preventing stuck jobs
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 2, // Move job to failed after 2 stalled detections
    lockDuration: 5 * 60 * 1000, // ✅ 5 minute timeout - auto-fail stuck jobs (increased from 60s)
  }
);

// Handle stalled jobs - this is critical for recovering from worker crashes
worker.on("stalled", async (jobId) => {
  log.warn(
    `⚠️ Job ${jobId} has stalled! Worker may have crashed during processing.`
  );

  try {
    // Try to recover the post status using the queue to get job info
    const job = await postQueue.getJob(jobId);
    if (job?.data?.postId) {
      const post = await Post.findById(job.data.postId);
      if (post && post.status === PostStatus.PUBLISHING) {
        // Check if post was actually published (has threadsPostId)
        if (post.threadsPostId) {
          post.status = PostStatus.PUBLISHED;
          log.info(
            `Recovered stalled job ${jobId} - post was actually published`
          );
        } else {
          post.status = PostStatus.FAILED;
          post.error = "Job stalled - worker crashed during processing";
          log.error(`Recovered stalled job ${jobId} - marked as failed`);
        }
        post.publishingProgress = {
          status: post.status === PostStatus.PUBLISHED ? "published" : "failed",
          completedAt: new Date(),
          currentStep: post.threadsPostId
            ? "Recovered from stall"
            : "Stalled - worker crashed",
          error: post.threadsPostId
            ? undefined
            : "Worker crashed during processing",
        };
        await post.save();
      }
    }
  } catch (error) {
    log.error(`Failed to recover stalled job ${jobId}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

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
    // Initialize adapter with correct credentials for this account
    let adapter = new ThreadsAdapter();
    if (post.threadsAccountId) {
      const credential = await threadsService.getCredentialById(
        post.threadsAccountId.toString()
      );
      if (credential) {
        adapter = new ThreadsAdapter(
          credential.threadsUserId,
          credential.accessToken
        );
        log.info(
          `💬 Using account ${credential.threadsUserId} for comment retry`
        );
      } else {
        log.warn(
          `Credential ${post.threadsAccountId} not found, using default`
        );
      }
    }

    // Use the stored threadsPostId (origin post ID) for comment
    const commentResult = await adapter.publishComment(
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
        `Comment retry failed for post ${postId}: ${commentResult.error}`
      );

      // ===== AUTO-RETRY: Schedule another retry for server errors =====
      const isServerError =
        commentResult.error?.includes("500") ||
        commentResult.error?.includes("Internal Server Error") ||
        commentResult.error?.includes("unexpected error") ||
        commentResult.error?.includes("retry");

      if (isServerError && post.commentRetryCount < maxRetries) {
        const retryDelay = 60000 * (post.commentRetryCount + 1); // Increasing delay
        log.info(
          `📅 Scheduling another comment retry in ${retryDelay / 1000
          }s for post ${postId} (attempt ${post.commentRetryCount + 1
          }/${maxRetries})`
        );

        await postQueue.add(
          "publish-post",
          {
            postId: post._id.toString(),
            commentOnlyRetry: true,
            accountId: post.threadsAccountId?.toString(),
          },
          {
            delay: retryDelay,
            jobId: `comment-retry-${post._id}-${Date.now()}`,
            attempts: 1,
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 86400 },
          }
        );
        log.success(
          `✅ Comment retry ${post.commentRetryCount + 1
          } scheduled for post ${postId}`
        );
      }

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

    // ===== AUTO-RETRY: Schedule retry for unexpected errors too =====
    const isServerError =
      errorMessage.includes("500") ||
      errorMessage.includes("Internal Server Error") ||
      errorMessage.includes("unexpected error") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("ECONNRESET");

    if (isServerError && post.commentRetryCount < maxRetries) {
      const retryDelay = 60000 * (post.commentRetryCount + 1);
      log.info(
        `📅 Scheduling comment retry after error in ${retryDelay / 1000
        }s for post ${postId}`
      );

      await postQueue.add(
        "publish-post",
        {
          postId: post._id.toString(),
          commentOnlyRetry: true,
          accountId: post.threadsAccountId?.toString(),
        },
        {
          delay: retryDelay,
          jobId: `comment-retry-${post._id}-${Date.now()}`,
          attempts: 1,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }

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

// ===== SCHEDULER WORKER =====
// Separate worker for the scheduler meta-queue
const schedulerWorker = new Worker(
  "scheduler-meta",
  async (job) => {
    log.info(`⏰ Scheduler check triggered: ${job.id}`);
    await eventDrivenScheduler.processDuePosts();
    return { success: true, checkedAt: new Date().toISOString() };
  },
  {
    connection,
    concurrency: 1, // Only one scheduler check at a time
    limiter: {
      max: 10,
      duration: 1000, // Max 10 checks per second
    },
  }
);

schedulerWorker.on("completed", (job) => {
  log.success(`✅ Scheduler check ${job.id} completed`);
});

schedulerWorker.on("failed", (job, err) => {
  log.error(`❌ Scheduler check ${job?.id} failed:`, {
    error: err.message,
  });
});

const startWorker = async () => {
  try {
    await connectDatabase();
    log.success("🚀 Worker is running...");

    // Choose which scheduler to use based on environment variable
    const useEventDriven = process.env.USE_EVENT_DRIVEN_SCHEDULER === "true";

    if (useEventDriven) {
      log.info("🎯 Using EVENT-DRIVEN scheduler");
      await eventDrivenScheduler.initialize();
    } else {
      log.info("🕐 Using POLLING scheduler (legacy)");
      schedulerService.start();
    }
  } catch (error) {
    log.error("Failed to start worker:", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

// ===== GRACEFUL SHUTDOWN =====
// Prevent jobs from getting stuck when worker restarts
const gracefulShutdown = async (signal: string) => {
  log.warn(`⚠️ Received ${signal}. Initiating graceful shutdown...`);

  try {
    // Close workers gracefully - wait for current jobs to complete
    log.info("Closing post publishing worker...");
    await worker.close();

    log.info("Closing scheduler worker...");
    await schedulerWorker.close();

    log.success("✅ Workers closed gracefully");
    process.exit(0);
  } catch (error) {
    log.error("Error during graceful shutdown:", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  log.error("Uncaught Exception:", {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  log.error("Unhandled Rejection:", { reason: String(reason) });
});

startWorker();
