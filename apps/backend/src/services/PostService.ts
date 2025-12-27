import {
  Post,
  PostStatus,
  PostType,
  IPost,
  SchedulePattern,
  type ScheduleConfig,
} from "../models/Post.js";
import { ThreadsAdapter } from "../adapters/ThreadsAdapter.js";
import { threadsService } from "./ThreadsService.js";
import axios from "axios";
import { log } from "../config/logger.js";

export class PostService {
  private threadsAdapter: ThreadsAdapter;

  constructor() {
    this.threadsAdapter = new ThreadsAdapter();
  }

  /**
   * Get all posts with optional filtering
   */
  async getPosts(filters?: {
    status?: string;
    postType?: string;
    skip?: number;
    limit?: number;
  }): Promise<{ posts: IPost[]; total: number }> {
    const query: Record<string, any> = {};

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.postType) {
      query.postType = filters.postType;
    }

    const total = await Post.countDocuments(query);
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(filters?.skip || 0)
      .limit(filters?.limit || 50);

    return { posts, total };
  }

  /**
   * Get single post by ID
   */
  async getPost(id: string): Promise<IPost> {
    const post = await Post.findById(id);
    if (!post) {
      throw new Error(`Post not found: ${id}`);
    }
    return post;
  }

  /**
   * Create new post
   */
  async createPost(data: Partial<IPost>): Promise<IPost> {
    const post = new Post({
      ...data,
      status: PostStatus.DRAFT,
    });
    return post.save();
  }

  /**
   * Update post
   */
  async updatePost(id: string, data: Partial<IPost>): Promise<IPost> {
    const post = await this.getPost(id);
    Object.assign(post, data);
    return post.save();
  }

  /**
   * Delete post
   */
  async deletePost(id: string): Promise<void> {
    await Post.findByIdAndDelete(id);
  }

  /**
   * Bulk delete posts
   */
  async bulkDelete(ids: string[]): Promise<{ deletedCount: number }> {
    const result = await Post.deleteMany({ _id: { $in: ids } });
    return { deletedCount: result.deletedCount || 0 };
  }

  /**
   * Publish post to Threads with progress tracking
   */
  async publishPost(
    postId: string,
    threadsUserId?: string
  ): Promise<{
    success: boolean;
    threadsPostId?: string;
    error?: string;
  }> {
    try {
      const post = await this.getPost(postId);

      // Update progress: publishing started
      post.status = PostStatus.PUBLISHING;
      post.publishingProgress = {
        status: "publishing",
        startedAt: new Date(),
        currentStep: "Initializing...",
      };
      await post.save();
      log.info(`[${postId}] Publishing started`, { status: "publishing" });

      // Get Threads credential
      post.publishingProgress.currentStep = "Fetching credentials...";
      await post.save();

      const credential = await threadsService.getValidCredential(
        threadsUserId || process.env.THREADS_USER_ID || ""
      );

      // Validate post for publishing
      post.publishingProgress.currentStep = "Validating post...";
      await post.save();

      this.validatePostForPublishing(post);

      // Update ThreadsAdapter with actual credentials
      const adapter = new ThreadsAdapter(
        credential.threadsUserId,
        credential.accessToken
      );

      // Track progress through adapter
      const progressCallback = (step: string) => {
        post.publishingProgress!.currentStep = step;
        post
          .save()
          .catch((err) =>
            log.error("Failed to save progress", { error: err.message })
          );
      };

      // Publish based on post type
      post.publishingProgress.currentStep = "Publishing to Threads...";
      await post.save();

      const result = await adapter.publishPost({
        content: post.content,
        mediaUrls: post.imageUrls,
        videoUrl: post.videoUrl,
        comment: post.comment,
        progressCallback, // Optional: pass callback if needed in adapter
      });

      // Update post with result
      post.threadsPostId = result.platformPostId;
      post.status = PostStatus.PUBLISHED;
      post.publishedAt = new Date();
      post.error = undefined;
      post.publishingProgress = {
        status: "published",
        startedAt: post.publishingProgress?.startedAt,
        completedAt: new Date(),
        currentStep: "Published successfully!",
      };
      await post.save();

      log.success(`[${postId}] Publishing completed`, {
        threadsPostId: result.platformPostId,
      });

      return {
        success: true,
        threadsPostId: result.platformPostId,
      };
    } catch (error) {
      const post = await this.getPost(postId);

      // Enhanced error logging
      if (axios.isAxiosError(error)) {
        log.error("Threads API error during publish", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
          requestUrl: error.config?.url,
          method: error.config?.method,
          postId,
        });
      } else {
        log.error("Non-Axios error during publish", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          postId,
        });
      }

      const errorMsg = error instanceof Error ? error.message : String(error);

      post.status = PostStatus.FAILED;
      post.error = errorMsg;
      post.publishingProgress = {
        status: "failed",
        startedAt: post.publishingProgress?.startedAt,
        completedAt: new Date(),
        currentStep: post.publishingProgress?.currentStep,
        error: errorMsg,
      };
      await post.save();

      log.error(`[${postId}] Publishing failed`, { error: errorMsg });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Get publishing progress for a post
   */
  async getPublishingProgress(postId: string) {
    const post = await this.getPost(postId);
    return post.publishingProgress;
  }

  /**
   * Schedule post for publishing with flexible patterns
   */
  async schedulePost(postId: string, config: ScheduleConfig): Promise<IPost> {
    console.log(`\n📅 PostService.schedulePost() called:`);
    console.log(`   Post ID: ${postId}`);
    console.log(`   Config:`, config);

    if (config.scheduledAt <= new Date()) {
      console.log(`Scheduled time is not in the future`);
      throw new Error("Scheduled time must be in the future");
    }

    const post = await this.getPost(postId);
    console.log(`   Found post: "${post.content.substring(0, 40)}..."`);

    this.validatePostForPublishing(post);
    console.log(` Post validation passed`);

    post.status = PostStatus.SCHEDULED;
    post.scheduledAt = config.scheduledAt;
    post.scheduleConfig = config;

    const savedPost = await post.save();
    console.log(` Post saved with status: ${savedPost.status}`);
    console.log(`   Scheduled At: ${savedPost.scheduledAt?.toISOString()}`);
    console.log(`   Schedule Config:`, savedPost.scheduleConfig);

    return savedPost;
  }

  /**
   * Get next scheduled publish time for recurring patterns
   */
  private getNextScheduleTime(config: ScheduleConfig): Date {
    const now = new Date();
    const nextRun = new Date(config.scheduledAt);
    const [hours, minutes] = (config.time || "09:00").split(":").map(Number);

    switch (config.pattern) {
      case SchedulePattern.ONCE:
        return config.scheduledAt;

      case SchedulePattern.WEEKLY: {
        const daysOfWeek = config.daysOfWeek || [1]; // Default: Monday
        while (nextRun <= now || !daysOfWeek.includes(nextRun.getDay())) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        nextRun.setHours(hours, minutes, 0, 0);
        return nextRun;
      }

      case SchedulePattern.MONTHLY: {
        const dayOfMonth = config.dayOfMonth || 1;
        nextRun.setDate(dayOfMonth);
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        return nextRun;
      }

      case SchedulePattern.DATE_RANGE: {
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now && config.endDate && config.endDate > now) {
          // Set for next occurrence within range
          nextRun.setDate(nextRun.getDate() + 1);
        }
        return nextRun <= (config.endDate || new Date(2099, 11, 31))
          ? nextRun
          : new Date(2099, 11, 31);
      }

      default:
        return config.scheduledAt;
    }
  }

  /**
   * Cancel scheduled post
   */
  async cancelSchedule(postId: string): Promise<IPost> {
    const post = await this.getPost(postId);

    if (post.status !== PostStatus.SCHEDULED) {
      throw new Error("Post is not scheduled");
    }

    post.status = PostStatus.DRAFT;
    post.scheduledAt = undefined;
    return post.save();
  }

  /**
   * Bulk schedule multiple posts within a time range with random distribution
   *
   * Algorithm:
   * 1. Calculate total time window (endTime - startTime) in milliseconds
   * 2. Generate N random timestamps within this window
   * 3. Sort timestamps to ensure sequential posting
   * 4. Optionally shuffle post order for natural behavior
   * 5. Assign each post a unique timestamp with no duplicates
   *
   * @param postIds - Array of post IDs to schedule
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @param options - Additional options (randomize order, seed for deterministic behavior)
   * @returns Array of scheduled posts with their timestamps
   */
  async bulkScheduleWithRandomDistribution(
    postIds: string[],
    startTime: Date,
    endTime: Date,
    options?: {
      randomizeOrder?: boolean;
      seed?: number;
    }
  ): Promise<
    Array<{
      post: IPost;
      scheduledAt: Date;
    }>
  > {
    // Validate inputs
    if (!postIds || postIds.length === 0) {
      throw new Error("At least one post ID is required");
    }

    if (startTime >= endTime) {
      throw new Error("Start time must be before end time");
    }

    if (startTime < new Date()) {
      throw new Error("Start time must be in the future");
    }

    const postCount = postIds.length;
    const totalDuration = endTime.getTime() - startTime.getTime();

    // Ensure we have enough time between posts (minimum 5 minutes)
    const minGapMs = 300000; // 5 minutes
    const requiredMinTime = postCount * minGapMs;
    if (totalDuration < requiredMinTime) {
      throw new Error(
        `Time range too short. Need at least ${Math.ceil(
          requiredMinTime / 60000
        )} minutes for ${postCount} posts with 5-minute minimum gaps`
      );
    }

    // Create seeded random number generator for deterministic results
    const seededRandom = (seed: number) => {
      let state = seed;
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    };
    const rng = options?.seed
      ? seededRandom(options.seed)
      : () => Math.random();

    // Generate random timestamps within the range
    const timestamps: number[] = [];
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    // Generate N unique random positions
    for (let i = 0; i < postCount; i++) {
      let timestamp: number;
      let attempts = 0;
      const maxAttempts = 100;

      // Keep generating until we get a unique timestamp (no collision)
      do {
        // Use random distribution across the entire time range
        timestamp = startMs + Math.floor(rng() * totalDuration);
        attempts++;

        // Fallback: if too many attempts, use deterministic spacing
        if (attempts >= maxAttempts) {
          const segment = totalDuration / postCount;
          timestamp =
            startMs +
            Math.floor(segment * i) +
            Math.floor(rng() * segment * 0.8);
          break;
        }
      } while (
        timestamps.some((t) => Math.abs(t - timestamp) < minGapMs) ||
        timestamp > endMs
      );

      timestamps.push(timestamp);
    }

    // Sort timestamps chronologically
    timestamps.sort((a, b) => a - b);

    // Ensure no timestamp exceeds endTime
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] > endMs) {
        timestamps[i] = endMs - (timestamps.length - i) * minGapMs;
      }
    }

    // Optionally randomize post order
    let orderedPostIds = [...postIds];
    if (options?.randomizeOrder) {
      // Fisher-Yates shuffle with seeded random
      for (let i = orderedPostIds.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [orderedPostIds[i], orderedPostIds[j]] = [
          orderedPostIds[j],
          orderedPostIds[i],
        ];
      }
    }

    // Schedule each post
    const results: Array<{ post: IPost; scheduledAt: Date }> = [];
    for (let i = 0; i < orderedPostIds.length; i++) {
      const postId = orderedPostIds[i];
      const scheduledAt = new Date(timestamps[i]);

      const scheduleConfig: ScheduleConfig = {
        pattern: SchedulePattern.ONCE,
        scheduledAt,
        time: `${scheduledAt
          .getHours()
          .toString()
          .padStart(2, "0")}:${scheduledAt
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
      };

      const post = await this.schedulePost(postId, scheduleConfig);
      results.push({ post, scheduledAt });

      log.info(
        `📅 Scheduled post ${
          i + 1
        }/${postCount}: ${postId} at ${scheduledAt.toISOString()}`
      );
    }

    log.success(
      ` Bulk scheduled ${
        results.length
      } posts from ${startTime.toISOString()} to ${endTime.toISOString()}`
    );

    return results;
  }

  /**
   * Reset post to draft (for retry after failure)
   */
  async resetToDraft(postId: string): Promise<IPost> {
    const post = await this.getPost(postId);
    post.status = PostStatus.DRAFT;
    post.error = undefined;
    return post.save();
  }

  /**
   * Validate post is ready for publishing
   */
  private validatePostForPublishing(post: IPost): void {
    if (!post.content || post.content.trim().length === 0) {
      throw new Error("Post content is required");
    }

    if (!post.postType) {
      throw new Error("Post type is required");
    }

    // Media posts need at least one image/video
    if (
      post.postType !== PostType.TEXT &&
      (!post.imageUrls || post.imageUrls.length === 0)
    ) {
      throw new Error(
        `${post.postType} posts require at least one image/video URL`
      );
    }
  }
}

export const postService = new PostService();
