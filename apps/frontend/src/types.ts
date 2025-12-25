export const PostStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
} as const;

export type PostStatusType = (typeof PostStatus)[keyof typeof PostStatus];

export const PostType = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  CAROUSEL: "CAROUSEL",
  VIDEO: "VIDEO",
} as const;

export type PostTypeType = (typeof PostType)[keyof typeof PostType];

export interface Post {
  _id: string;
  content: string;
  postType: PostTypeType | string;
  status: PostStatusType | string;
  imageUrls: string[];
  topic?: string;
  skipAI?: boolean;
  comment?: string;
  threadsPostId?: string;
  scheduledAt?: string | Date;
  jobId?: string;
  excelId?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ThreadsCredential {
  _id: string;
  threadsUserId: string;
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken?: string;
  longLivedAccessToken?: string;
  expiresAt?: Date;
  longLivedExpiresAt?: Date;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  scope?: string[];
  errorCount: number;
  lastError?: string;
  lastRefreshedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
