import { Post, PostStatus, PostType, IPost } from "../models/Post.js";
import { ThreadsAdapter } from "../adapters/ThreadsAdapter.js";
import { threadsService } from "./ThreadsService.js";

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
   * Publish post to Threads
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

      // Get Threads credential
      const credential = await threadsService.getValidCredential(
        threadsUserId || process.env.THREADS_USER_ID || ""
      );

      // Validate post for publishing
      this.validatePostForPublishing(post);

      // Update ThreadsAdapter with actual credentials
      const adapter = new ThreadsAdapter(
        credential.threadsUserId,
        credential.accessToken
      );

      // Publish based on post type
      const result = await adapter.publishPost({
        content: post.content,
        mediaUrls: post.imageUrls,
        videoUrl: post.videoUrl,
        comment: post.comment, // Include comment if provided
      });

      // Update post with result
      post.threadsPostId = result.platformPostId;
      post.status = PostStatus.PUBLISHED;
      post.publishedAt = new Date();
      post.error = undefined;
      await post.save();

      return {
        success: true,
        threadsPostId: result.platformPostId,
      };
    } catch (error) {
      const post = await this.getPost(postId);
      const errorMsg = error instanceof Error ? error.message : String(error);

      post.status = PostStatus.FAILED;
      post.error = errorMsg;
      await post.save();

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Schedule post for publishing
   */
  async schedulePost(postId: string, scheduledAt: Date): Promise<IPost> {
    if (scheduledAt <= new Date()) {
      throw new Error("Scheduled time must be in the future");
    }

    const post = await this.getPost(postId);
    this.validatePostForPublishing(post);

    post.status = PostStatus.SCHEDULED;
    post.scheduledAt = scheduledAt;
    return post.save();
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
