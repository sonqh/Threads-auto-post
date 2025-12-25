import { useState, useCallback } from "react";
import { postsApi } from "../lib/api";
import type { Post } from "../types";

export const useThreadsPublish = () => {
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const publish = useCallback(async (postId: string, post: Post) => {
    // Validate before publishing
    if (!post.content || post.content.trim().length === 0) {
      throw new Error("Post content is required");
    }

    if (
      post.postType !== "TEXT" &&
      (!post.imageUrls || post.imageUrls.length === 0)
    ) {
      throw new Error(
        `${post.postType} posts require at least one image or video URL`
      );
    }

    setPublishing((prev) => ({ ...prev, [postId]: true }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[postId];
      return newErrors;
    });

    try {
      const result = await postsApi.publishPost(postId);
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to publish post";
      setErrors((prev) => ({ ...prev, [postId]: message }));
      throw err;
    } finally {
      setPublishing((prev) => ({ ...prev, [postId]: false }));
    }
  }, []);

  const schedulePost = useCallback(
    async (postId: string, scheduledAt: Date) => {
      if (scheduledAt <= new Date()) {
        throw new Error("Scheduled time must be in the future");
      }

      try {
        return await postsApi.schedulePost(postId, scheduledAt.toISOString());
      } catch (err) {
        throw err instanceof Error ? err : new Error("Failed to schedule post");
      }
    },
    []
  );

  const cancelSchedule = useCallback(async (postId: string) => {
    try {
      return await postsApi.cancelSchedule(postId);
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to cancel schedule");
    }
  }, []);

  return {
    publish,
    schedulePost,
    cancelSchedule,
    publishing,
    errors,
  };
};
