import { useState, useCallback } from "react";
import type { Post, PostStatusType } from "../types";
import { postsApi } from "../lib/api";

export const usePostList = (initialStatus?: PostStatusType) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);

  const fetchPosts = useCallback(
    async (status?: PostStatusType | string, pageNum = 0) => {
      setLoading(true);
      setError(null);
      try {
        const result = await postsApi.getPosts({
          status,
          limit,
          skip: pageNum * limit,
        });
        setPosts(result.data);
        setTotal(result.total);
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch posts");
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  const refetch = useCallback(
    () => fetchPosts(initialStatus, page),
    [fetchPosts, initialStatus, page]
  );

  const deletePost = useCallback(async (id: string) => {
    try {
      await postsApi.deletePost(id);
      setPosts((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete post");
    }
  }, []);

  const bulkDelete = useCallback(async (ids: string[]) => {
    try {
      await postsApi.bulkDelete(ids);
      setPosts((prev) => prev.filter((p) => !ids.includes(p._id)));
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete posts");
    }
  }, []);

  const updatePost = useCallback(async (id: string, data: Partial<Post>) => {
    try {
      // Ensure types are properly cast for the API
      const apiData = {
        ...data,
        status: data.status as
          | "DRAFT"
          | "SCHEDULED"
          | "PUBLISHED"
          | "FAILED"
          | undefined,
        postType: data.postType as
          | "TEXT"
          | "IMAGE"
          | "CAROUSEL"
          | "VIDEO"
          | undefined,
        scheduledAt:
          data.scheduledAt instanceof Date
            ? data.scheduledAt.toISOString()
            : data.scheduledAt,
        createdAt:
          data.createdAt instanceof Date
            ? data.createdAt.toISOString()
            : data.createdAt,
        updatedAt:
          data.updatedAt instanceof Date
            ? data.updatedAt.toISOString()
            : data.updatedAt,
      };
      const updated = await postsApi.updatePost(id, apiData);
      setPosts((prev) => prev.map((p) => (p._id === id ? updated : p)));
      return updated;
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to update post");
    }
  }, []);

  return {
    posts,
    loading,
    error,
    total,
    page,
    limit,
    fetchPosts,
    refetch,
    deletePost,
    bulkDelete,
    updatePost,
  };
};
