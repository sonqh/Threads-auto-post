export interface MediaItem {
  url: string;
  type: "image" | "video";
}

export interface PublishPostData {
  content: string;
  mediaUrls?: string[];
  videoUrl?: string;
  comment?: string; // Optional comment to post after the main post
  progressCallback?: (step: string) => void; // Optional callback to track progress
  skipComment?: boolean; // Skip comment publishing (for separate comment-only retry)
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
  commentResult?: CommentPublishResult; // Separate tracking for comment
}

export interface CommentPublishResult {
  success: boolean;
  commentId?: string;
  error?: string;
}

export abstract class BasePlatformAdapter {
  abstract publishPost(data: PublishPostData): Promise<PublishResult>;
  abstract publishComment(
    originPostId: string,
    comment: string
  ): Promise<CommentPublishResult>;
  abstract validateMedia(url: string): Promise<boolean>;
  abstract getName(): string;
}
