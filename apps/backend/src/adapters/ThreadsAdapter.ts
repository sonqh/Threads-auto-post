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

  async publishPost(data: PublishPostData): Promise<PublishResult> {
    try {
      if (!this.userId || !this.accessToken) {
        return {
          success: false,
          error: "Threads credentials not configured",
        };
      }

      // Step 1: Determine post type and create media containers
      let containerId: string;

      if (data.videoUrl) {
        // Video post
        containerId = await this.createVideoContainer(
          data.content,
          data.videoUrl
        );
      } else if (data.mediaUrls && data.mediaUrls.length > 1) {
        // Carousel post
        containerId = await this.createCarouselContainer(
          data.content,
          data.mediaUrls
        );
      } else if (data.mediaUrls && data.mediaUrls.length === 1) {
        // Single image post
        containerId = await this.createImageContainer(
          data.content,
          data.mediaUrls[0]
        );
      } else {
        // Text-only post
        containerId = await this.createTextContainer(data.content);
      }

      // Step 2: Publish the container
      const postId = await this.publishContainer(containerId);
      log.thread(`Post published successfully with ID: ${postId}`);

      // Step 3: Wait 30 seconds before posting comment (if provided)
      if (data.comment) {
        log.info("Waiting 30 seconds before posting comment...");
        await new Promise((resolve) => setTimeout(resolve, 30000));

        // Step 4: Create comment text container
        log.thread("Creating comment container...");
        const commentContainerId = await this.createCommentContainer(
          postId,
          data.comment
        );

        // Step 5: Publish the comment
        log.thread("Publishing comment...");
        await this.publishContainer(commentContainerId);
        log.success("Comment published successfully!");
      }

      return {
        success: true,
        platformPostId: postId,
      };
    } catch (error: any) {
      log.error("Threads publish error", error);

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
    const response = await axios.post(
      `${this.baseUrl}/${this.userId}/threads`,
      {
        media_type: "TEXT",
        text,
        access_token: this.accessToken,
      }
    );
    return response.data.id;
  }

  private async createCommentContainer(
    replyToId: string,
    text: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/${this.userId}/threads`,
      {
        media_type: "TEXT",
        text,
        reply_to_id: replyToId,
        access_token: this.accessToken,
      }
    );
    return response.data.id;
  }

  private async createImageContainer(
    text: string,
    imageUrl: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/${this.userId}/threads`,
      {
        media_type: "IMAGE",
        image_url: imageUrl,
        text,
        access_token: this.accessToken,
      }
    );
    return response.data.id;
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
    // Create individual media containers (supports both images and videos)
    const mediaContainerIds: string[] = [];

    for (const mediaUrl of mediaUrls.slice(0, 10)) {
      // Threads supports up to 10 items
      const mediaType = this.detectMediaType(mediaUrl);

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

      const response = await axios.post(
        `${this.baseUrl}/${this.userId}/threads`,
        payload
      );
      mediaContainerIds.push(response.data.id);
    }

    // Create carousel container
    const response = await axios.post(
      `${this.baseUrl}/${this.userId}/threads`,
      {
        media_type: "CAROUSEL",
        children: mediaContainerIds,
        text,
        access_token: this.accessToken,
      }
    );
    return response.data.id;
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
    const response = await axios.post(
      `${this.baseUrl}/${this.userId}/threads_publish`,
      {
        creation_id: containerId,
        access_token: this.accessToken,
      }
    );
    return response.data.id;
  }
}
