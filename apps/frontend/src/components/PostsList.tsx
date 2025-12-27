import { format } from "date-fns";
import { Download } from "lucide-react";
import React, { useEffect, useState, useCallback } from "react";
import { usePostList, useThreadsPublish } from "../hooks";
import { PostsHeader } from "./PostsHeader";
import { PostsTable } from "./PostsTable";
import { EditPostModal } from "./EditPostModal";
import { SchedulerModal } from "./SchedulerModal";
import { BulkSchedulerModal } from "./BulkSchedulerModal";
import { Pagination } from "./Pagination";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  PostStatus,
  type Post,
  type PostStatusType,
  type ScheduleConfig,
} from "@/types";
import { LinksModal } from "./LinksModal";
import { postsApi } from "../lib/api";

const STATUS_FILTERS = ["" as const, ...Object.values(PostStatus)] as const;

export const PostsList: React.FC = () => {
  const {
    posts,
    loading,
    total,
    page,
    limit,
    setLimit,
    fetchPosts,
    deletePost,
    bulkDelete,
    updatePost,
  } = usePostList();
  const { publish, schedulePost, cancelSchedule, publishing } =
    useThreadsPublish();

  // UI State
  const [selectedStatus, setSelectedStatus] = useState<PostStatusType | "">("");
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(limit);

  // Modal State
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [linksModalPost, setLinksModalPost] = useState<Post | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [schedulingPostId, setSchedulingPostId] = useState<string | null>(null);
  const [showBulkSchedulerModal, setShowBulkSchedulerModal] = useState(false);

  // Calculate pagination
  const totalPages = Math.ceil(total / pageSize);

  // Load posts when filters or pagination change
  useEffect(() => {
    fetchPosts(selectedStatus || undefined, page);
  }, [selectedStatus, page, fetchPosts]);

  // Reset to first page when status filter changes
  useEffect(() => {
    if (page !== 0) {
      fetchPosts(selectedStatus || undefined, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatus]);

  // Handlers - Selection
  const handleSelectPost = useCallback((id: string) => {
    setSelectedPosts((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return newSelected;
    });
  }, []);

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected) {
        setSelectedPosts(new Set(posts.map((p) => p._id)));
      } else {
        setSelectedPosts(new Set());
      }
    },
    [posts]
  );

  // Handlers - Bulk Actions
  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      if (!confirm(`Are you sure you want to delete ${ids.length} post(s)?`)) {
        return;
      }

      try {
        await bulkDelete(ids);
        setSelectedPosts(new Set());
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to delete posts:", error);
        alert("Failed to delete posts. Please try again.");
      }
    },
    [bulkDelete, fetchPosts, selectedStatus, page]
  );

  const handleBulkSchedule = useCallback(
    async (ids: string[], config: ScheduleConfig) => {
      try {
        for (const id of ids) {
          await schedulePost(id, config);
        }
        setSelectedPosts(new Set());
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to schedule posts:", error);
        alert("Failed to schedule posts. Please try again.");
      }
    },
    [schedulePost, fetchPosts, selectedStatus, page]
  );

  // Handler for new bulk schedule with random distribution
  const handleBulkScheduleWithRandomDistribution = useCallback(
    async (
      startTime: string,
      endTime: string,
      options: { randomizeOrder: boolean }
    ) => {
      if (selectedPosts.size === 0) {
        alert("No posts selected");
        return;
      }

      try {
        const response = await postsApi.bulkSchedule(
          Array.from(selectedPosts),
          startTime,
          endTime,
          options
        );

        console.log(" Bulk schedule response:", response);
        alert(`Successfully scheduled ${response.count} posts!`);

        setSelectedPosts(new Set());
        setShowBulkSchedulerModal(false);
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to bulk schedule posts:", error);
        const errorMsg =
          error instanceof Error ? error.message : "Failed to schedule posts";
        alert(`Error: ${errorMsg}`);
      }
    },
    [selectedPosts, fetchPosts, selectedStatus, page]
  );

  // Handlers - Single Post Actions
  const handleDeletePost = useCallback(
    async (id: string) => {
      if (!confirm("Are you sure you want to delete this post?")) return;

      try {
        await deletePost(id);
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to delete post:", error);
        alert("Failed to delete post. Please try again.");
      }
    },
    [deletePost, fetchPosts, selectedStatus, page]
  );

  const handlePublish = useCallback(
    async (postId: string) => {
      const post = posts.find((p) => p._id === postId);
      if (!post) return;

      if (!confirm("Publish this post to Threads now?")) return;

      try {
        await publish(postId, post);
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to publish:", error);
        alert("Failed to publish post. Please try again.");
      }
    },
    [posts, publish, fetchPosts, selectedStatus, page]
  );

  const handleSchedule = useCallback((postId: string) => {
    setSchedulingPostId(postId);
    setShowSchedulerModal(true);
  }, []);

  const handleSchedulerSubmit = useCallback(
    async (config: ScheduleConfig) => {
      if (!schedulingPostId) return;
      try {
        console.log("🎯 PostsList: Schedule submitted");
        console.log(`   Post ID: ${schedulingPostId}`);
        console.log(`   Config:`, config);

        await schedulePost(schedulingPostId, config);
        console.log(" PostsList: Schedule API success");

        await fetchPosts(selectedStatus || undefined, page);
        setShowSchedulerModal(false);
        setSchedulingPostId(null);
      } catch (error) {
        console.error("PostsList: Failed to schedule:", error);
        alert("Failed to schedule post. Please try again.");
      }
    },
    [schedulingPostId, schedulePost, fetchPosts, selectedStatus, page]
  );

  const handleCancel = useCallback(
    async (postId: string) => {
      try {
        await cancelSchedule(postId);
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to cancel schedule:", error);
        alert("Failed to cancel schedule. Please try again.");
      }
    },
    [cancelSchedule, fetchPosts, selectedStatus, page]
  );

  // Handlers - Edit Modal
  const handleEditPost = useCallback((post: Post) => {
    setEditingPost(post);
    setShowEditModal(true);
  }, []);

  const handleSavePost = useCallback(
    async (updatedPost: Partial<Post>) => {
      if (!editingPost) return;

      await updatePost(editingPost._id, updatedPost);
      setShowEditModal(false);
      setEditingPost(null);
      await fetchPosts(selectedStatus || undefined, page);
    },
    [editingPost, updatePost, fetchPosts, selectedStatus, page]
  );

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingPost(null);
  }, []);

  // Handlers - Pagination
  const handlePageChange = useCallback(
    (newPage: number) => {
      fetchPosts(selectedStatus || undefined, newPage);
    },
    [fetchPosts, selectedStatus]
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      setLimit(newSize);
      fetchPosts(selectedStatus || undefined, 0, newSize);
    },
    [fetchPosts, selectedStatus, setLimit]
  );

  // Export functionality
  const exportToCSV = useCallback(() => {
    const csv = [
      ["Content", "Type", "Status", "Topic", "Links", "Comment", "Scheduled"],
      ...posts.map((p) => [
        p.content,
        p.postType,
        p.status,
        p.topic || "",
        p.imageUrls?.length || 0,
        p.comment || "",
        p.scheduledAt
          ? format(new Date(p.scheduledAt), "yyyy-MM-dd HH:mm")
          : "",
      ]),
    ]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `posts-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [posts]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Posts</CardTitle>
            <CardDescription>
              Manage your Threads posts ({total} total)
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={exportToCSV}
            disabled={posts.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {STATUS_FILTERS.map((status) => (
            <Button
              key={status || "all"}
              variant={selectedStatus === status ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus(status)}
            >
              {status || "All"}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && page === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            Loading posts...
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts found</p>
            {selectedStatus && (
              <p className="text-sm mt-2">
                Try changing the filter or create a new post
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Selection Header */}
            <PostsHeader
              selectedCount={selectedPosts.size}
              selectedIds={Array.from(selectedPosts)}
              onSelectAll={handleSelectAll}
              onBulkDelete={handleBulkDelete}
              onBulkSchedule={handleBulkSchedule}
              onBulkScheduleRandom={() => setShowBulkSchedulerModal(true)}
            />

            {/* Posts Table */}
            <PostsTable
              posts={posts}
              selectedIds={selectedPosts}
              onSelectPost={handleSelectPost}
              onEditPost={handleEditPost}
              onPublish={handlePublish}
              onSchedule={handleSchedule}
              onCancel={handleCancel}
              onDelete={handleDeletePost}
              publishingIds={
                new Set(Object.keys(publishing).filter((id) => publishing[id]))
              }
            />

            {/* Pagination */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}

        {/* Links Modal - Legacy, can be removed if not used */}
        {showLinksModal && linksModalPost && (
          <LinksModal
            post={linksModalPost}
            onClose={() => {
              setShowLinksModal(false);
              setLinksModalPost(null);
            }}
            onSave={(links) => {
              console.log("Save links:", links);
              setShowLinksModal(false);
              setLinksModalPost(null);
            }}
          />
        )}

        {/* Edit Post Modal */}
        {showEditModal && editingPost && (
          <EditPostModal
            post={editingPost}
            onClose={handleCloseEditModal}
            onSave={handleSavePost}
          />
        )}

        {/* Scheduler Modal */}
        <SchedulerModal
          isOpen={showSchedulerModal}
          onClose={() => {
            setShowSchedulerModal(false);
            setSchedulingPostId(null);
          }}
          onSchedule={handleSchedulerSubmit}
        />

        {/* Bulk Scheduler Modal */}
        <BulkSchedulerModal
          isOpen={showBulkSchedulerModal}
          onClose={() => setShowBulkSchedulerModal(false)}
          onSchedule={handleBulkScheduleWithRandomDistribution}
          postCount={selectedPosts.size}
        />
      </CardContent>
    </Card>
  );
};
