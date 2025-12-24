import { Worker } from "bullmq";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database.js";
import { createRedisConnection } from "./config/redis.js";
import { Post, PostStatus } from "./models/Post.js";
import { ThreadsAdapter } from "./adapters/ThreadsAdapter.js";

dotenv.config();

const connection = createRedisConnection();
const threadsAdapter = new ThreadsAdapter();

const worker = new Worker(
  "post-publishing",
  async (job) => {
    const { postId } = job.data;

    console.log(`📤 Processing post ${postId}...`);

    try {
      const post = await Post.findById(postId);

      if (!post) {
        throw new Error(`Post ${postId} not found`);
      }

      if (post.status === PostStatus.PUBLISHED) {
        console.log(`⏭️  Post ${postId} already published, skipping`);
        return { success: true, skipped: true };
      }

      // Prepare media URLs
      const mediaUrls = post.imageUrls.filter(
        (url) => url && url.trim() !== ""
      );
      const videoUrl =
        post.videoUrl && post.videoUrl.trim() !== ""
          ? post.videoUrl
          : undefined;

      // Publish to Threads
      const result = await threadsAdapter.publishPost({
        content: post.content,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        videoUrl,
      });

      if (result.success) {
        post.status = PostStatus.PUBLISHED;
        post.threadsPostId = result.platformPostId;
        post.publishedAt = new Date();
        post.error = undefined;
        await post.save();

        console.log(
          `✅ Post ${postId} published successfully: ${result.platformPostId}`
        );
        return { success: true, platformPostId: result.platformPostId };
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Failed to publish post ${postId}:`, errorMessage);

      // Update post status
      const post = await Post.findById(postId);
      if (post) {
        post.status = PostStatus.FAILED;
        post.error = errorMessage;
        await post.save();
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000, // 10 requests per minute
    },
  }
);

worker.on("ready", () => {
  console.log("🔄 Worker started and ready to process jobs");
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

const startWorker = async () => {
  try {
    await connectDatabase();
    console.log("🚀 Worker is running...");
  } catch (error) {
    console.error("Failed to start worker:", error);
    process.exit(1);
  }
};

startWorker();
