import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export enum PostType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  CAROUSEL = "CAROUSEL",
  VIDEO = "VIDEO",
}

export enum PostStatus {
  DRAFT = "DRAFT",
  SCHEDULED = "SCHEDULED",
  PUBLISHING = "PUBLISHING",
  PUBLISHED = "PUBLISHED",
  FAILED = "FAILED",
}

// Comment status enum for separate tracking
export enum CommentStatus {
  NONE = "NONE", // No comment to post
  PENDING = "PENDING", // Comment waiting to be posted
  POSTING = "POSTING", // Currently posting comment
  POSTED = "POSTED", // Comment successfully posted
  FAILED = "FAILED", // Comment failed (post still successful)
}

export enum SchedulePattern {
  ONCE = "ONCE",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  DATE_RANGE = "DATE_RANGE",
}

export interface ScheduleConfig {
  pattern: SchedulePattern;
  scheduledAt: Date; // For ONCE and DATE_RANGE start date
  endDate?: Date; // For DATE_RANGE: when to stop recurring
  daysOfWeek?: number[]; // For WEEKLY: 0=Sunday, 1=Monday, etc.
  dayOfMonth?: number; // For MONTHLY: 1-31
  time?: string; // HH:mm format (defaults to 09:00)
}

export interface IPost extends Document {
  // Excel columns mapping
  excelId?: string; // ID
  topic?: string; // Chủ đề
  content: string; // Nội dung bài post
  status: PostStatus; // Trạng thái
  skipAI?: boolean; // Skip AI
  threadsPostId?: string; // Post ID (after publishing)
  postType: PostType; // Loại bài viết
  comment?: string; // Comment
  videoUrl?: string; // Link Video
  imageUrls: string[]; // Link ảnh 1-10
  mergeLinks?: string; // Gộp Link

  // Multi-account support
  userId?: string; // App user who created this post
  threadsAccountId?: string; // Which Threads account to post to
  threadsAccountName?: string; // Account name for reference
  bulkPostId?: string; // Group multiple posts to different accounts

  // Scheduling
  scheduledAt?: Date;
  scheduleConfig?: ScheduleConfig; // Flexible schedule pattern
  publishedAt?: Date;

  // Job tracking
  jobId?: string;
  publishingProgress?: {
    status: "pending" | "publishing" | "published" | "failed" | "ready_to_retry";
    startedAt?: Date;
    completedAt?: Date;
    lastUpdated?: Date; // ✅ PHASE 2: Track when progress was last updated
    currentStep?: string; // e.g., "Creating image container", "Publishing post", "Creating comment"
    progress?: number; // ✅ PHASE 2: Progress percentage (0-100)
    error?: string;
  };

  // Idempotency and duplication prevention
  contentHash?: string; // Hash of content + media URLs for duplicate detection
  idempotencyKey?: string; // Unique key for exactly-once publishing
  executionLock?: {
    lockedAt: Date;
    lockedBy: string; // Worker ID or job ID
    expiresAt: Date;
  };

  // Comment tracking (separate from post status)
  commentStatus: CommentStatus;
  commentError?: string;
  commentRetryCount?: number;
  threadsCommentId?: string; // Stored after successful comment

  // Error tracking
  error?: string;
  errorCategory?: "FATAL" | "RETRYABLE" | "TRANSIENT"; // Error classification for smart retry logic
  suggestedAction?: string; // User-facing guidance on how to fix the error

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Utility function to generate content hash for duplicate detection
export function generateContentHash(
  content: string,
  imageUrls: string[] = [],
  videoUrl?: string
): string {
  const normalizedContent = content.trim().toLowerCase();
  const sortedImageUrls = [...imageUrls].sort().join("|");
  const payload = `${normalizedContent}|${sortedImageUrls}|${videoUrl || ""}`;
  return crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex")
    .substring(0, 16);
}

const PostSchema = new Schema<IPost>(
  {
    excelId: { type: String },
    topic: { type: String },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(PostStatus),
      default: PostStatus.DRAFT,
    },
    skipAI: { type: Boolean, default: false },
    threadsPostId: { type: String },
    postType: {
      type: String,
      enum: Object.values(PostType),
      required: true,
    },
    comment: { type: String },
    videoUrl: { type: String },
    imageUrls: { type: [String], default: [] },
    mergeLinks: { type: String },

    // Multi-account fields
    userId: { type: String, index: true },
    threadsAccountId: { type: mongoose.Schema.Types.ObjectId, index: true },
    threadsAccountName: { type: String },
    bulkPostId: { type: String, index: true },

    scheduledAt: { type: Date },
    scheduleConfig: {
      pattern: {
        type: String,
        enum: Object.values(SchedulePattern),
      },
      scheduledAt: Date,
      endDate: Date,
      daysOfWeek: [Number],
      dayOfMonth: Number,
      time: { type: String, default: "09:00" },
    },
    publishedAt: { type: Date },
    jobId: { type: String },
    publishingProgress: {
      status: {
        type: String,
        enum: ["pending", "publishing", "published", "failed", "ready_to_retry"],
      },
      startedAt: Date,
      completedAt: Date,
      currentStep: String,
      error: String,
    },
    // Idempotency fields
    contentHash: { type: String, index: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    executionLock: {
      lockedAt: Date,
      lockedBy: String,
      expiresAt: Date,
    },
    // Comment tracking
    commentStatus: {
      type: String,
      enum: Object.values(CommentStatus),
      default: CommentStatus.NONE,
    },
    commentError: { type: String },
    commentRetryCount: { type: Number, default: 0 },
    threadsCommentId: { type: String },
    error: { type: String },
    errorCategory: {
      type: String,
      enum: ["FATAL", "RETRYABLE", "TRANSIENT"],
    },
    suggestedAction: { type: String },
  },
  {
    timestamps: true,
  }
);

// Indexes
PostSchema.index({ status: 1, scheduledAt: 1 });
PostSchema.index({ threadsPostId: 1 });
PostSchema.index({ contentHash: 1, publishedAt: 1 }); // For duplicate detection
PostSchema.index({ "executionLock.expiresAt": 1 }); // For lock cleanup
PostSchema.index({ userId: 1, createdAt: -1 }); // For user's posts
PostSchema.index({ threadsAccountId: 1, status: 1 }); // For account-specific posts

export const Post = mongoose.model<IPost>("Post", PostSchema);
