import { format } from "date-fns";
import { Download, ArrowUp, ArrowDown } from "lucide-react";
import React, { useEffect, useState, useCallback } from "react";
import { usePostList, useThreadsPublish, useCredentials } from "../hooks";
import { PostsHeader } from "./PostsHeader";
import { PostsTable } from "./PostsTable";
import { EditPostModal } from "./EditPostModal";
import { SchedulerModal } from "./SchedulerModal";
import { BulkSchedulerModal } from "./BulkSchedulerModal";
import { Pagination } from "./Pagination";
import { AccountSelector } from "./AccountSelector";
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
  PostType,
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
  const { credentials } = useCredentials();

  // UI State
  const [selectedStatus, setSelectedStatus] = useState<PostStatusType | "">(
    () => {
      // Read status from URL on mount
      const params = new URLSearchParams(window.location.search);
      const statusParam = params.get("status");
      return statusParam &&
        Object.values(PostStatus).includes(statusParam as PostStatusType)
        ? (statusParam as PostStatusType)
        : "";
    }
  );
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [selectedAccountId, setSelectedAccountId] = useState<
    string | undefined
  >(undefined);
  const [pageSize, setPageSize] = useState(limit);
  const [sortBy, setSortBy] = useState<
    "createdAt" | "scheduledAt" | "publishedAt"
  >("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [postTypeFilter, setPostTypeFilter] = useState<string | "">(() => {
    // Read postType from URL on mount
    const params = new URLSearchParams(window.location.search);
    return params.get("postType") || "";
  });

  // Initialize selectedAccountId when credentials load
  useEffect(() => {
    if (credentials.length > 0 && !selectedAccountId) {
      const defaultCred = credentials.find((c) => c.isDefault);
      setSelectedAccountId(defaultCred?.id || credentials[0]?.id);
    }
  }, [credentials, selectedAccountId]);

  // Close scheduler modal when account changes to prevent stale accountId
  useEffect(() => {
    if (showSchedulerModal) {
      // Account changed while modal was open - close it
      setShowSchedulerModal(false);
      setSchedulingPostId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);

  useEffect(() => {
    console.log("selectedAccountId ", selectedAccountId);
  }, [selectedAccountId]);

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

  // Update URL and reset to first page when status filter changes
  useEffect(() => {
    // Update URL with status parameter
    const params = new URLSearchParams(window.location.search);
    if (selectedStatus) {
      params.set("status", selectedStatus);
    } else {
      params.delete("status");
    }
    const newUrl = `${window.location.pathname}${
      params.toString() ? "?" + params.toString() : ""
    }`;
    window.history.replaceState({}, "", newUrl);

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

  // Handler for sorting
  const handleSort = useCallback(
    (field: "createdAt" | "scheduledAt" | "publishedAt") => {
      if (sortBy === field) {
        // Toggle direction if same field
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        // New field, default to descending (newest first)
        setSortBy(field);
        setSortDirection("desc");
      }
    },
    [sortBy]
  );

  // Sort posts in memory
  const sortedPosts = useCallback(() => {
    let filtered = [...posts];

    // Filter by postType if selected
    if (postTypeFilter) {
      filtered = filtered.filter((p) => p.postType === postTypeFilter);
    }

    return filtered.sort((a, b) => {
      let aVal: string | Date | undefined;
      let bVal: string | Date | undefined;

      if (sortBy === "createdAt") {
        aVal = a.createdAt;
        bVal = b.createdAt;
      } else if (sortBy === "scheduledAt") {
        aVal = a.scheduledAt;
        bVal = b.scheduledAt;
      } else if (sortBy === "publishedAt") {
        // Use updatedAt as a proxy for published time
        aVal = a.status === "PUBLISHED" ? a.updatedAt : undefined;
        bVal = b.status === "PUBLISHED" ? b.updatedAt : undefined;
      }

      // Handle undefined values - put them at the end
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      const aTime =
        aVal instanceof Date ? aVal.getTime() : new Date(aVal).getTime();
      const bTime =
        bVal instanceof Date ? bVal.getTime() : new Date(bVal).getTime();
      const comparison = aTime - bTime;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [posts, sortBy, sortDirection, postTypeFilter])();

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

  const handleBulkCancel = useCallback(
    async (ids: string[]) => {
      try {
        const result = await postsApi.bulkCancel(ids);
        alert(`Successfully cancelled ${result.cancelled} scheduled post(s)`);
        setSelectedPosts(new Set());
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to cancel schedules:", error);
        alert("Failed to cancel schedules. Please try again.");
      }
    },
    [fetchPosts, selectedStatus, page]
  );

  // Handler for new bulk schedule with random distribution
  const handleBulkScheduleWithRandomDistribution = useCallback(
    async (
      startTime: string,
      endTime: string,
      options: { randomizeOrder: boolean; accountId?: string }
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

      if (!selectedAccountId) {
        alert("Please select an account to publish to");
        return;
      }

      if (!confirm("Publish this post to Threads now?")) return;

      try {
        await publish(postId, post, selectedAccountId);

        // Wait a bit for the backend to process, then poll for updated status
        let attempts = 0;
        const maxAttempts = 15; // 15 attempts = ~7.5 seconds max wait

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms

          const result = await postsApi.getPost(postId);
          if (result.status === "PUBLISHED" || result.status === "FAILED") {
            // Post is done processing, refresh the list
            await fetchPosts(selectedStatus || undefined, page);
            return;
          }

          attempts++;
        }

        // Timeout - just refresh anyway
        await fetchPosts(selectedStatus || undefined, page);
      } catch (error) {
        console.error("Failed to publish:", error);
        alert("Failed to publish post. Please try again.");
      }
    },
    [posts, publish, fetchPosts, selectedStatus, page]
  );

  const handleFixStuck = useCallback(
    async (postId: string) => {
      try {
        await postsApi.fixStuckPost(postId);
        // Refresh the posts list
        await fetchPosts(selectedStatus || undefined, page);
        alert("Post fixed! Status updated.");
      } catch (error) {
        console.error("Failed to fix stuck post:", error);
        alert("Failed to fix stuck post. Please try again.");
      }
    },
    [fetchPosts, selectedStatus, page]
  );

  const handlePostRecovered = useCallback(
    (_post: Post) => {
      // Refetch the list after recovery - the post parameter tells us which post was recovered
      fetchPosts(selectedStatus || undefined, page);
    },
    [fetchPosts, selectedStatus, page]
  );

  const handleSchedule = useCallback((postId: string) => {
    setSchedulingPostId(postId);
    setShowSchedulerModal(true);
  }, []);

  const handleSchedulerSubmit = useCallback(
    async (config: ScheduleConfig) => {
      if (!schedulingPostId) return;

      // Get the LATEST selectedAccountId value at submit time, not from closure
      const currentAccountId = selectedAccountId;

      if (!currentAccountId) {
        alert("Please select an account to schedule for");
        return;
      }
      try {
        console.log("🎯 PostsList: Schedule submitted");
        console.log(`   Post ID: ${schedulingPostId}`);
        console.log(`   Config:`, config);
        console.log(`   Account ID: ${currentAccountId}`);

        await schedulePost(schedulingPostId, config, [currentAccountId]);
        console.log(" PostsList: Schedule API success");

        await fetchPosts(selectedStatus || undefined, page);
        setShowSchedulerModal(false);
        setSchedulingPostId(null);
      } catch (error) {
        console.error("PostsList: Failed to schedule:", error);
        alert("Failed to schedule post. Please try again.");
      }
    },
    [
      schedulingPostId,
      schedulePost,
      fetchPosts,
      selectedStatus,
      page,
      selectedAccountId,
    ]
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

        {/* Account & Type Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <AccountSelector
            credentials={credentials}
            selectedAccountId={selectedAccountId}
            onSelect={(id) =>
              setSelectedAccountId(typeof id === "string" ? id : id[0])
            }
            className="col-span-1"
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">Post Type</label>
            <div className="flex flex-wrap gap-2">
              {["", ...Object.values(PostType)].map((type) => (
                <Button
                  key={type || "all-types"}
                  variant={postTypeFilter === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPostTypeFilter(type)}
                  className="text-xs"
                >
                  {type || "All Types"}
                </Button>
              ))}
            </div>
          </div>
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
              onBulkCancel={handleBulkCancel}
            />

            {/* Sorting Controls */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sort by:</span>
              <Button
                variant={sortBy === "createdAt" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSort("createdAt")}
              >
                Created
                {sortBy === "createdAt" &&
                  (sortDirection === "asc" ? (
                    <ArrowUp className="ml-1 h-3 w-3" />
                  ) : (
                    <ArrowDown className="ml-1 h-3 w-3" />
                  ))}
              </Button>
              <Button
                variant={sortBy === "scheduledAt" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSort("scheduledAt")}
              >
                Scheduled
                {sortBy === "scheduledAt" &&
                  (sortDirection === "asc" ? (
                    <ArrowUp className="ml-1 h-3 w-3" />
                  ) : (
                    <ArrowDown className="ml-1 h-3 w-3" />
                  ))}
              </Button>
              <Button
                variant={sortBy === "publishedAt" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSort("publishedAt")}
              >
                Published
                {sortBy === "publishedAt" &&
                  (sortDirection === "asc" ? (
                    <ArrowUp className="ml-1 h-3 w-3" />
                  ) : (
                    <ArrowDown className="ml-1 h-3 w-3" />
                  ))}
              </Button>
            </div>

            {/* Posts Table */}
            <PostsTable
              posts={sortedPosts}
              selectedIds={selectedPosts}
              onSelectPost={handleSelectPost}
              onEditPost={handleEditPost}
              onPublish={handlePublish}
              onSchedule={handleSchedule}
              onCancel={handleCancel}
              onDelete={handleDeletePost}
              onFixStuck={handleFixStuck}
              onPostRecovered={handlePostRecovered}
              publishingIds={
                new Set(Object.keys(publishing).filter((id) => publishing[id]))
              }
              credentials={credentials}
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
            credentials={credentials}
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
          selectedAccount={credentials.find((c) => c.id === selectedAccountId)}
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
