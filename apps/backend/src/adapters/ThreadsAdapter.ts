import axios from "axios";
import {
  BasePlatformAdapter,
  PublishPostData,
  PublishResult,
  CommentPublishResult,
} from "./BasePlatformAdapter.js";
import { log } from "../config/logger.js";

interface ThreadsMediaContainer {
  id: string;
}

export class ThreadsAdapter extends BasePlatformAdapter {
  private userId: string;
  private accessToken: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor(userId?: string, accessToken?: string) {
    super();
    this.userId = userId || process.env.THREADS_USER_ID || "";
    this.accessToken = accessToken || process.env.THREADS_ACCESS_TOKEN || "";
    this.apiVersion = process.env.THREADS_API_VERSION || "v1.0";
    this.baseUrl = `https://graph.threads.net/${this.apiVersion}`;

    if (!this.userId || !this.accessToken) {
      log.warn(
        "Threads credentials not configured. Set THREADS_USER_ID and THREADS_ACCESS_TOKEN or pass them as constructor parameters."
      );
    }
  }

  getName(): string {
    return "Threads";
  }

  async validateMedia(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      log.error(`Media validation failed for ${url}`, error);
      return false;
    }
  }

  /**
   * Extract URLs from text
   */
  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Split comment into parts if it exceeds link limit
   */
  private splitCommentByLinkLimit(
    text: string,
    maxLinks: number = 5
  ): string[] {
    const lines = text.split("\n");
    const parts: string[] = [];
    let currentPart = "";
    let currentLinkCount = 0;

    for (const line of lines) {
      const lineUrls = this.extractUrls(line);
      const lineUrlCount = lineUrls.length;

      // If adding this line would exceed limit, start a new part
      if (currentLinkCount + lineUrlCount > maxLinks && currentPart.trim()) {
        parts.push(currentPart.trim());
        currentPart = line;
        currentLinkCount = lineUrlCount;
      } else {
        if (currentPart) {
          currentPart += "\n" + line;
        } else {
          currentPart = line;
        }
        currentLinkCount += lineUrlCount;
      }
    }

    // Add remaining part
    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }

    return parts.length > 0 ? parts : [text];
  }

  async publishPost(data: PublishPostData): Promise<PublishResult> {
    let commentResult: CommentPublishResult | undefined;

    try {
      log.info("🚀 Starting publishPost", {
        hasComment: !!data.comment,
        skipComment: data.skipComment || false,
        hasVideoUrl: !!data.videoUrl,
        mediaUrlsCount: data.mediaUrls?.length || 0,
        contentLength: data.content.length,
        commentLength: data.comment?.length || 0,
      });

      // ✅ PHASE 2: Report initial progress
      data.progressCallback?.("Starting publish process...");

      if (!this.userId || !this.accessToken) {
        return {
          success: false,
          error: "Threads credentials not configured",
        };
      }

      // Step 1: Determine post type and create media containers
      let containerId: string;

      if (data.videoUrl) {
        // ✅ PHASE 2: Report progress
        data.progressCallback?.("Creating video container...");
        log.debug("📹 Creating video container");
        // Video post
        containerId = await this.createVideoContainer(
          data.content,
          data.videoUrl
        );
        log.debug(` Video container created: ${containerId}`);
      } else if (data.mediaUrls && data.mediaUrls.length > 1) {
        // ✅ PHASE 2: Report progress
        data.progressCallback?.(
          `Creating carousel with ${data.mediaUrls.length} images...`
        );
        log.debug(
          `🎠 Creating carousel container with ${data.mediaUrls.length} images`
        );
        // Carousel post
        containerId = await this.createCarouselContainer(
          data.content,
          data.mediaUrls
        );
        log.debug(` Carousel container created: ${containerId}`);
      } else if (data.mediaUrls && data.mediaUrls.length === 1) {
        // ✅ PHASE 2: Report progress
        data.progressCallback?.("Creating image container...");
        log.debug(`🖼️ Creating image container`);
        // Single image post
        containerId = await this.createImageContainer(
          data.content,
          data.mediaUrls[0]
        );
        log.debug(` Image container created: ${containerId}`);
      } else {
        // ✅ PHASE 2: Report progress
        data.progressCallback?.("Creating text post...");
        log.debug("Creating text-only container");
        // Text-only post
        containerId = await this.createTextContainer(data.content);
        log.debug(` Text container created: ${containerId}`);
      }

      // Step 2: Publish the container
      // ✅ PHASE 2: Report progress
      data.progressCallback?.("Publishing to Threads API...");
      log.info(`📤 Publishing container ${containerId}`);
      const postId = await this.publishContainer(containerId);
      log.thread(`🧵 Post published successfully with ID: ${postId}`);

      // Step 3: Handle comments (unless skipComment is true)
      // Comment failures should NOT fail the entire post - track separately
      if (data.comment && !data.skipComment) {
        // ✅ PHASE 2: Report progress
        data.progressCallback?.("Creating comment...");
        log.info("💬 Publishing comment separately from post...");
        commentResult = await this.publishComment(postId, data.comment);

        if (!commentResult.success) {
          log.warn(
            `Comment failed but post succeeded. Comment error: ${commentResult.error}`
          );
          // Don't throw - post is still successful
        }
      }

      return {
        success: true,
        platformPostId: postId,
        commentResult, // Include comment result for separate tracking
      };
    } catch (error: any) {
      log.error("Error in publishPost", {
        errorType: error.constructor.name,
        errorMessage: error.message,
      });

      // Enhanced error logging with full details
      if (axios.isAxiosError(error)) {
        log.error("🔴 Threads API error", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          errorData: error.response?.data,
          errorMessage: error.response?.data?.error?.message,
          errorCode: error.response?.data?.error?.code,
          errorType: error.response?.data?.error?.type,
          errorUserMsg: error.response?.data?.error?.error_user_msg,
          requestUrl: error.config?.url,
          requestMethod: error.config?.method,
          requestData: error.config?.data,
        });
      } else {
        log.error("Threads publish error", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }

      // Extract error message from Threads API response
      let errorMessage = "Failed to publish to Threads";

      if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        errorMessage =
          apiError.message || apiError.error_user_msg || errorMessage;

        // Check for token expiration
        if (apiError.code === 190 || errorMessage.includes("expired")) {
          errorMessage = `Access token has expired. Please refresh your token. Details: ${errorMessage}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Publish a comment to an existing post
   * This method is idempotent and always replies to the ORIGINAL post ID
   * to ensure comments are not chained as replies to each other
   */
  async publishComment(
    originPostId: string,
    comment: string
  ): Promise<CommentPublishResult> {
    try {
      log.info("💬 Starting publishComment", {
        originPostId,
        commentLength: comment.length,
      });

      // Check if comment has more than 5 links - split if needed
      const commentUrls = this.extractUrls(comment);
      log.info("💬 Analyzing comment", {
        totalUrls: commentUrls.length,
        commentLength: comment.length,
      });

      let lastCommentId: string | undefined;

      if (commentUrls.length > 5) {
        // Split comment into multiple parts
        const commentParts = this.splitCommentByLinkLimit(comment, 5);
        log.info(
          `💬 Comment split into ${commentParts.length} parts due to link limit`
        );

        // IMPORTANT: All comment parts reply to the ORIGINAL POST, not to each other
        for (let i = 0; i < commentParts.length; i++) {
          const part = commentParts[i];
          const partUrls = this.extractUrls(part);

          log.info(`💬 Posting comment part ${i + 1}/${commentParts.length}`, {
            urlCount: partUrls.length,
            textLength: part.length,
            replyingTo: originPostId,
            note: "All parts reply to original post",
          });

          if (i > 0) {
            // Wait 30s between comments to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 30000));
          }

          const commentContainerId = await this.createCommentContainer(
            originPostId,
            part
          );
          log.debug(` Comment container created: ${commentContainerId}`);

          lastCommentId = await this.publishContainer(commentContainerId);
          log.success(
            `💬 Comment part ${i + 1} published with ID: ${lastCommentId}`
          );
        }
      } else {
        // Single comment
        log.info("💬 Comment within link limit, posting single comment", {
          urlCount: commentUrls.length,
        });

        const commentContainerId = await this.createCommentContainer(
          originPostId,
          comment
        );
        log.debug(` Comment container created: ${commentContainerId}`);

        lastCommentId = await this.publishContainer(commentContainerId);
        log.success(`💬 Comment published with ID: ${lastCommentId}`);
      }

      return {
        success: true,
        commentId: lastCommentId,
      };
    } catch (error: any) {
      log.error("Error in publishComment", {
        errorType: error.constructor.name,
        errorMessage: error.message,
        originPostId,
      });

      // Extract error message
      let errorMessage = "Failed to publish comment";
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        const apiError = error.response.data.error;
        errorMessage =
          apiError.message || apiError.error_user_msg || errorMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async createTextContainer(text: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.userId}/threads`,
        {
          media_type: "TEXT",
          text,
          access_token: this.accessToken,
        }
      );
      return response.data.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        log.error(`Failed to create text container`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          textLength: text.length,
        });
      }
      throw error;
    }
  }

  private async createCommentContainer(
    replyToId: string,
    text: string
  ): Promise<string> {
    try {
      log.info(`Creating comment for post ${replyToId}`, {
        textLength: text.length,
      });
      const response = await axios.post(
        `${this.baseUrl}/${this.userId}/threads`,
        {
          media_type: "TEXT",
          text,
          reply_to_id: replyToId,
          access_token: this.accessToken,
        }
      );
      log.info(`Comment container created: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        log.error(`Failed to create comment container`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          replyToId,
          textLength: text.length,
          requestUrl: `${this.baseUrl}/${this.userId}/threads`,
        });
      }
      throw error;
    }
  }

  private async createImageContainer(
    text: string,
    imageUrl: string
  ): Promise<string> {
    try {
      log.info("🖼️ Creating image container", {
        imageUrl,
        textLength: text.length,
        baseUrl: this.baseUrl,
        userId: this.userId,
      });

      const payload = {
        media_type: "IMAGE",
        image_url: imageUrl,
        text,
        access_token: this.accessToken,
      };

      log.debug("📤 Sending image container request", {
        url: `${this.baseUrl}/${this.userId}/threads`,
        payloadKeys: Object.keys(payload),
      });

      const response = await axios.post(
        `${this.baseUrl}/${this.userId}/threads`,
        payload
      );

      log.info(` Image container response:`, {
        containerId: response.data.id,
        status: response.status,
      });

      return response.data.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        log.error(`Failed to create image container`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          errorMessage: error.response?.data?.error?.message,
          errorCode: error.response?.data?.error?.code,
          errorUserMsg: error.response?.data?.error?.error_user_msg,
          imageUrl,
          textLength: text.length,
        });
      }
      throw error;
    }
  }

  private async createVideoContainer(
    text: string,
    videoUrl: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/${this.userId}/threads`,
      {
        media_type: "VIDEO",
        video_url: videoUrl,
        text,
        access_token: this.accessToken,
      }
    );
    return response.data.id;
  }

  private async createCarouselContainer(
    text: string,
    mediaUrls: string[]
  ): Promise<string> {
    log.info(`🎠 Creating carousel with ${mediaUrls.length} items`);

    // Create individual media containers (supports both images and videos)
    const mediaContainerIds: string[] = [];

    for (let i = 0; i < mediaUrls.slice(0, 10).length; i++) {
      const mediaUrl = mediaUrls[i];
      const mediaType = this.detectMediaType(mediaUrl);

      log.debug(`  Creating child ${i + 1}/${mediaUrls.length}: ${mediaType}`);

      const payload: any = {
        media_type: mediaType,
        is_carousel_item: true,
        access_token: this.accessToken,
      };

      if (mediaType === "VIDEO") {
        payload.video_url = mediaUrl;
      } else {
        payload.image_url = mediaUrl;
      }

      try {
        const response = await axios.post(
          `${this.baseUrl}/${this.userId}/threads`,
          payload
        );
        const childId = response.data.id;
        mediaContainerIds.push(childId);
        log.debug(`   Child ${i + 1} created: ${childId}`);
      } catch (error) {
        log.error(`  Failed to create child ${i + 1}:`, {
          error: error instanceof Error ? error.message : String(error),
          mediaUrl,
        });
        throw error;
      }
    }

    log.info(` All ${mediaContainerIds.length} carousel items created`);
    log.debug(`Carousel child IDs: ${mediaContainerIds.join(", ")}`);

    // Wait briefly for all children to be processed (optional but recommended)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create carousel container
    log.info("📦 Creating carousel container...");
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.userId}/threads`,
        {
          media_type: "CAROUSEL",
          children: mediaContainerIds,
          text,
          access_token: this.accessToken,
        }
      );
      log.success(` Carousel container created: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      log.error("Failed to create carousel container:", {
        error: error instanceof Error ? error.message : String(error),
        childIds: mediaContainerIds,
      });
      throw error;
    }
  }

  private detectMediaType(url: string): "IMAGE" | "VIDEO" {
    const videoExtensions = [
      ".mp4",
      ".mov",
      ".avi",
      ".webm",
      ".mkv",
      ".flv",
      ".wmv",
      ".m4v",
    ];
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some((ext) => lowerUrl.includes(ext))
      ? "VIDEO"
      : "IMAGE";
  }

  private async publishContainer(
    containerId: string,
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log.info(`📤 Publishing container (attempt ${attempt}/${maxRetries})`, {
          containerId,
          url: `${this.baseUrl}/${this.userId}/threads_publish`,
        });

        const payload = {
          creation_id: containerId,
          access_token: this.accessToken,
        };

        const response = await axios.post(
          `${this.baseUrl}/${this.userId}/threads_publish`,
          payload
        );

        log.info(` Container published`, {
          publishedId: response.data.id,
          status: response.status,
          containerId,
          attempt,
        });

        return response.data.id;
      } catch (error) {
        lastError = error as Error;

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorMessage =
            error.response?.data?.error?.message || error.message;

          log.error(
            `Failed to publish container (attempt ${attempt}/${maxRetries})`,
            {
              status,
              statusText: error.response?.statusText,
              errorMessage,
              errorCode: error.response?.data?.error?.code,
              errorUserMsg: error.response?.data?.error?.error_user_msg,
              containerId,
              url: `${this.baseUrl}/${this.userId}/threads_publish`,
            }
          );

          // Retry on 5xx server errors or specific transient errors
          const isRetryable = status && status >= 500 && status < 600;
          const isTransientError =
            errorMessage?.toLowerCase().includes("unexpected error") ||
            errorMessage?.toLowerCase().includes("retry");

          if ((isRetryable || isTransientError) && attempt < maxRetries) {
            const delay = 5000 * attempt; // 5s, 10s, 15s
            log.warn(`⏳ Retrying in ${delay / 1000}s due to server error...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        // Non-retryable error or max retries reached
        throw error;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error("Failed to publish container after retries");
  }
}
