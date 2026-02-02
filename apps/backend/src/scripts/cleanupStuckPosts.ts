#!/usr/bin/env node
/**
 * Cleanup Script for Stuck Posts
 * 
 * This script fixes posts that are stuck in PUBLISHING status due to:
 * - Legacy code that didn't update status properly
 * - Worker crashes during publishing
 * - Jobs that timed out without cleanup
 * 
 * Usage:
 *   npm run cleanup-stuck-posts
 *   
 * Or with custom timeout:
 *   npm run cleanup-stuck-posts -- --timeout 120
 */

import dotenv from "dotenv";
import { connectDatabase } from "../config/database.js";
import { Post, PostStatus } from "../models/Post.js";
import { log } from "../config/logger.js";

dotenv.config();

// Default timeout: 5 minutes (same as job timeout)
const DEFAULT_TIMEOUT_SECONDS = 5 * 60;

interface CleanupStats {
  total: number;
  fixed: number;
  skipped: number;
  errors: number;
}

async function cleanupStuckPosts(timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS) {
  console.log("\n🔧 Starting cleanup of stuck posts...\n");
  
  const stats: CleanupStats = {
    total: 0,
    fixed: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    await connectDatabase();
    console.log("✅ Connected to database\n");

    // Find all posts stuck in PUBLISHING status
    const stuckPosts = await Post.find({
      status: PostStatus.PUBLISHING,
    });

    stats.total = stuckPosts.length;
    console.log(`📊 Found ${stats.total} posts in PUBLISHING status\n`);

    if (stats.total === 0) {
      console.log("✨ No stuck posts found! Database is clean.\n");
      return stats;
    }

    const cutoffTime = new Date(Date.now() - timeoutSeconds * 1000);
    console.log(`⏰ Cutoff time: ${cutoffTime.toISOString()}`);
    console.log(`   (Posts stuck for more than ${timeoutSeconds}s will be marked as FAILED)\n`);

    for (const post of stuckPosts) {
      const startedAt = post.publishingProgress?.startedAt;
      
      if (!startedAt) {
        // No start time - definitely stuck, mark as failed
        console.log(`❌ Post ${post._id}: No start time recorded`);
        await markAsFailed(post, "Publishing started but no timestamp recorded");
        stats.fixed++;
        continue;
      }

      const elapsedSeconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      
      if (new Date(startedAt) < cutoffTime) {
        // Stuck for too long
        console.log(`❌ Post ${post._id}: Stuck for ${elapsedSeconds}s (${Math.floor(elapsedSeconds / 60)}m)`);
        console.log(`   Content: "${post.content.substring(0, 50)}..."`);
        console.log(`   Last step: ${post.publishingProgress?.currentStep || "Unknown"}`);
        
        await markAsFailed(
          post,
          `Publishing timed out after ${elapsedSeconds}s. Last step: ${post.publishingProgress?.currentStep || "Unknown"}`
        );
        stats.fixed++;
      } else {
        // Still within timeout - might be actively publishing
        console.log(`⏳ Post ${post._id}: Publishing for ${elapsedSeconds}s (still within timeout)`);
        stats.skipped++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📈 Cleanup Summary:");
    console.log("=".repeat(60));
    console.log(`Total posts checked:     ${stats.total}`);
    console.log(`Fixed (marked as FAILED): ${stats.fixed}`);
    console.log(`Skipped (still active):   ${stats.skipped}`);
    console.log(`Errors:                   ${stats.errors}`);
    console.log("=".repeat(60) + "\n");

    if (stats.fixed > 0) {
      console.log("✅ Cleanup complete! Fixed posts are now marked as FAILED.");
      console.log("   Users can retry them from the UI.\n");
    } else {
      console.log("✨ No cleanup needed - all posts are within timeout.\n");
    }

  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    stats.errors++;
  }

  return stats;
}

async function markAsFailed(post: any, errorMessage: string) {
  try {
    post.status = PostStatus.FAILED;
    post.error = errorMessage;
    post.publishingProgress = {
      ...post.publishingProgress,
      status: "failed",
      completedAt: new Date(),
      error: errorMessage,
    };
    await post.save();
    console.log(`   ✓ Marked as FAILED\n`);
  } catch (error) {
    console.error(`   ✗ Failed to update post:`, error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--timeout" && args[i + 1]) {
    timeoutSeconds = parseInt(args[i + 1], 10);
    if (isNaN(timeoutSeconds) || timeoutSeconds <= 0) {
      console.error("❌ Invalid timeout value. Using default:", DEFAULT_TIMEOUT_SECONDS);
      timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
    }
  }
}

// Run cleanup
cleanupStuckPosts(timeoutSeconds)
  .then(() => {
    console.log("👋 Cleanup script finished. Exiting...\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
