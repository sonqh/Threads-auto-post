import axios from "axios";
import {
  BasePlatformAdapter,
  PublishPostData,
  PublishResult,
} from "./BasePlatformAdapter.js";

interface ThreadsMediaContainer {
  id: string;
}

export class ThreadsAdapter extends BasePlatformAdapter {
  private userId: string;
  private accessToken: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor() {
    super();
    this.userId = process.env.THREADS_USER_ID || "";
    this.accessToken = process.env.THREADS_ACCESS_TOKEN || "";
    this.apiVersion = process.env.THREADS_API_VERSION || "v1.0";
    this.baseUrl = `https://graph.threads.net/${this.apiVersion}`;

    if (!this.userId || !this.accessToken) {
      console.warn(
        "⚠️  Threads credentials not configured. Set THREADS_USER_ID and THREADS_ACCESS_TOKEN."
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
      console.error(`Media validation failed for ${url}:`, error);
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

      // Determine post type and create media containers
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

      // Publish the container
      const postId = await this.publishContainer(containerId);

      return {
        success: true,
        platformPostId: postId,
      };
    } catch (error: any) {
      console.error("Threads publish error:", error);
      return {
        success: false,
        error: error.message || "Failed to publish to Threads",
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
    imageUrls: string[]
  ): Promise<string> {
    // Create individual media containers
    const mediaContainerIds: string[] = [];

    for (const imageUrl of imageUrls.slice(0, 10)) {
      // Threads supports up to 10 items
      const response = await axios.post(
        `${this.baseUrl}/${this.userId}/threads`,
        {
          media_type: "IMAGE",
          image_url: imageUrl,
          is_carousel_item: true,
          access_token: this.accessToken,
        }
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
