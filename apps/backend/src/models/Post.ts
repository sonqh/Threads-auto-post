import mongoose, { Schema, Document } from "mongoose";

export enum PostType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  CAROUSEL = "CAROUSEL",
  VIDEO = "VIDEO",
}

export enum PostStatus {
  DRAFT = "DRAFT",
  SCHEDULED = "SCHEDULED",
  PUBLISHED = "PUBLISHED",
  FAILED = "FAILED",
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

  // Scheduling
  scheduledAt?: Date;
  publishedAt?: Date;

  // Job tracking
  jobId?: string;

  // Error tracking
  error?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
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
    scheduledAt: { type: Date },
    publishedAt: { type: Date },
    jobId: { type: String },
    error: { type: String },
  },
  {
    timestamps: true,
  }
);

// Indexes
PostSchema.index({ status: 1, scheduledAt: 1 });
PostSchema.index({ threadsPostId: 1 });

export const Post = mongoose.model<IPost>("Post", PostSchema);
