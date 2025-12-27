import axios from "axios";
import {
  BasePlatformAdapter,
  PublishPostData,
  PublishResult,
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
    try {
      log.info("🚀 Starting publishPost", {
        hasComment: !!data.comment,
        hasVideoUrl: !!data.videoUrl,
        mediaUrlsCount: data.mediaUrls?.length || 0,
        contentLength: data.content.length,
        commentLength: data.comment?.length || 0,
      });

      if (!this.userId || !this.accessToken) {
        return {
          success: false,
          error: "Threads credentials not configured",
        };
      }

      // Step 1: Determine post type and create media containers
      let containerId: string;

      if (data.videoUrl) {
        log.debug("📹 Creating video container");
        // Video post
        containerId = await this.createVideoContainer(
          data.content,
          data.videoUrl
        );
        log.debug(`✅ Video container created: ${containerId}`);
      } else if (data.mediaUrls && data.mediaUrls.length > 1) {
        log.debug(
          `🎠 Creating carousel container with ${data.mediaUrls.length} images`
        );
        // Carousel post
        containerId = await this.createCarouselContainer(
          data.content,
          data.mediaUrls
        );
        log.debug(`✅ Carousel container created: ${containerId}`);
      } else if (data.mediaUrls && data.mediaUrls.length === 1) {
        log.debug(`🖼️ Creating image container`);
        // Single image post
        containerId = await this.createImageContainer(
          data.content,
          data.mediaUrls[0]
        );
        log.debug(`✅ Image container created: ${containerId}`);
      } else {
        log.debug("📝 Creating text-only container");
        // Text-only post
        containerId = await this.createTextContainer(data.content);
        log.debug(`✅ Text container created: ${containerId}`);
      }

      // Step 2: Publish the container
      log.info(`📤 Publishing container ${containerId}`);
      const postId = await this.publishContainer(containerId);
      log.thread(`🧵 Post published successfully with ID: ${postId}`);

      // Step 3: Handle comments with link limit
      if (data.comment) {
        // Check if comment has more than 5 links
        const commentUrls = this.extractUrls(data.comment);
        log.info("💬 Analyzing comment", {
          totalUrls: commentUrls.length,
          commentLength: data.comment.length,
        });

        if (commentUrls.length > 5) {
          // Split comment into multiple parts
          const commentParts = this.splitCommentByLinkLimit(data.comment, 5);
          log.info(
            `💬 Comment split into ${commentParts.length} parts due to link limit`
          );

          // IMPORTANT: All comment parts should reply to the ORIGINAL POST, not to each other
          // This prevents creating a chain of replies
          const replyToId = postId; // All comments reply to the original post

          for (let i = 0; i < commentParts.length; i++) {
            const part = commentParts[i];
            const partUrls = this.extractUrls(part);

            log.info(
              `💬 Posting comment part ${i + 1}/${commentParts.length}`,
              {
                urlCount: partUrls.length,
                textLength: part.length,
                replyingTo: replyToId,
                note: "All parts reply to original post",
              }
            );

            await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30s between comments

            const commentContainerId = await this.createCommentContainer(
              replyToId,
              part
            );
            log.debug(`✅ Comment container created: ${commentContainerId}`);

            const commentPostId = await this.publishContainer(
              commentContainerId
            );
            log.success(
              `💬 Comment part ${
                i + 1
              } published successfully with ID: ${commentPostId}`
            );

            // Note: replyToId stays as postId - all parts reply to original post
          }
        } else {
          // Original flow: single comment
          log.info("💬 Comment within link limit, posting single comment", {
            urlCount: commentUrls.length,
          });

          await new Promise((resolve) => setTimeout(resolve, 30000));

          log.info(`Creating comment container for post ${postId}...`);
          const commentContainerId = await this.createCommentContainer(
            postId,
            data.comment
          );
          log.debug(`✅ Comment container created: ${commentContainerId}`);

          log.info(`📤 Publishing comment container ${commentContainerId}`);
          await this.publishContainer(commentContainerId);
          log.success("💬 Comment published successfully!");
        }
      }

      return {
        success: true,
        platformPostId: postId,
      };
    } catch (error: any) {
      log.error("❌ Error in publishPost", {
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

      log.info(`✅ Image container response:`, {
        containerId: response.data.id,
        status: response.status,
      });

      return response.data.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        log.error(`❌ Failed to create image container`, {
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
        log.debug(`  ✅ Child ${i + 1} created: ${childId}`);
      } catch (error) {
        log.error(`  ❌ Failed to create child ${i + 1}:`, {
          error: error instanceof Error ? error.message : String(error),
          mediaUrl,
        });
        throw error;
      }
    }

    log.info(`✅ All ${mediaContainerIds.length} carousel items created`);
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
      log.success(`✅ Carousel container created: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      log.error("❌ Failed to create carousel container:", {
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

  private async publishContainer(containerId: string): Promise<string> {
    try {
      log.info(`📤 Publishing container`, {
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

      log.info(`✅ Container published`, {
        publishedId: response.data.id,
        status: response.status,
        containerId,
      });

      return response.data.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        log.error(`❌ Failed to publish container`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          errorMessage: error.response?.data?.error?.message,
          errorCode: error.response?.data?.error?.code,
          errorUserMsg: error.response?.data?.error?.error_user_msg,
          containerId,
          url: `${this.baseUrl}/${this.userId}/threads_publish`,
        });
      }
      throw error;
    }
  }
}
