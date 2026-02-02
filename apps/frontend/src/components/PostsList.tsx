import { format } from "date-fns";
import {
  Download,
  ArrowUp,
  ArrowDown,
  Plus,
  Users,
  UserCircle,
  Star,
} from "lucide-react";
import React, { useEffect, useState, useCallback } from "react";
import {
  usePostList,
  useThreadsPublish,
  useCredentials,
  useAccountContext,
} from "../hooks";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
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
  const { selectedAccountId, setSelectedAccount, getAccountById } =
    useAccountContext();
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
    createPost,
  } = usePostList();
  const { publish, schedulePost, cancelSchedule, publishing } =
    useThreadsPublish();
  const { credentials } = useCredentials();
  // Modal State
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [linksModalPost, setLinksModalPost] = useState<Post | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [schedulingPostId, setSchedulingPostId] = useState<string | null>(null);
  const [showBulkSchedulerModal, setShowBulkSchedulerModal] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
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

  // Calculate post counts per account for quick switcher
  const [postCountsByAccount, setPostCountsByAccount] = useState<
    Record<string, number>
  >({});

  // Fetch post counts for each account
  useEffect(() => {
    const fetchPostCounts = async () => {
      const counts: Record<string, number> = {};

      // Get count for "All Accounts"
      const allResult = await postsApi.getPosts({ limit: 0 });
      counts["all"] = allResult.total;

      // Get count for each specific account
      for (const cred of credentials) {
        try {
          const result = await postsApi.getPosts({
            accountId: cred.id,
            limit: 0,
          });
          counts[cred.id] = result.total;
        } catch (error) {
          console.error(`Failed to get count for ${cred.id}`, error);
          counts[cred.id] = 0;
        }
      }

      setPostCountsByAccount(counts);
    };

    if (credentials.length > 0) {
      fetchPostCounts();
    }
  }, [credentials, selectedStatus, page]); // Refresh counts when status or page changes

  // Close scheduler modal when account changes to prevent stale accountId
  useEffect(() => {
    if (showSchedulerModal) {
      setShowSchedulerModal(false);
      setSchedulingPostId(null);
    }
  }, [selectedAccountId, showSchedulerModal]);

  useEffect(() => {
    if (selectedAccountId) {
      console.log("selectedAccountId ", getAccountById(selectedAccountId));
    }
  }, [selectedAccountId, getAccountById]);

  // Calculate pagination
  const totalPages = Math.ceil(total / pageSize);

  // Load posts when filters, pagination, or selected account change
  useEffect(() => {
    fetchPosts(
      selectedStatus || undefined,
      page,
      undefined,
      selectedAccountId || undefined
    );
  }, [selectedStatus, page, selectedAccountId, fetchPosts]);

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
      fetchPosts(
        selectedStatus || undefined,
        0,
        undefined,
        selectedAccountId || undefined
      );
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
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
      } catch (error) {
        console.error("Failed to delete posts:", error);
        alert("Failed to delete posts. Please try again.");
      }
    },
    [bulkDelete, fetchPosts, selectedStatus, page, selectedAccountId]
  );

  const handleBulkSchedule = useCallback(
    async (ids: string[], config: ScheduleConfig) => {
      try {
        for (const id of ids) {
          await schedulePost(id, config);
        }
        setSelectedPosts(new Set());
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
      } catch (error) {
        console.error("Failed to schedule posts:", error);
        alert("Failed to schedule posts. Please try again.");
      }
    },
    [schedulePost, fetchPosts, selectedStatus, page, selectedAccountId]
  );

  const handleBulkCancel = useCallback(
    async (ids: string[]) => {
      try {
        const result = await postsApi.bulkCancel(ids);
        alert(`Successfully cancelled ${result.cancelled} scheduled post(s)`);
        setSelectedPosts(new Set());
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
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
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
      } catch (error) {
        console.error("Failed to bulk schedule posts:", error);
        const errorMsg =
          error instanceof Error ? error.message : "Failed to schedule posts";
        alert(`Error: ${errorMsg}`);
      }
    },
    [selectedPosts, fetchPosts, selectedStatus, page, selectedAccountId]
  );

  // Handlers - Single Post Actions
  const handleDeletePost = useCallback(
    async (id: string) => {
      if (!confirm("Are you sure you want to delete this post?")) return;

      try {
        await deletePost(id);
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
      } catch (error) {
        console.error("Failed to delete post:", error);
        alert("Failed to delete post. Please try again.");
      }
    },
    [deletePost, fetchPosts, selectedStatus, page, selectedAccountId]
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
            await fetchPosts(
              selectedStatus || undefined,
              page,
              undefined,
              selectedAccountId || undefined
            );
            return;
          }

          attempts++;
        }

        // Timeout - just refresh anyway
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
      } catch (error) {
        console.error("Failed to publish:", error);
        alert("Failed to publish post. Please try again.");
      }
    },
    [posts, publish, fetchPosts, selectedStatus, page, selectedAccountId]
  );

  const handleFixStuck = useCallback(
    async (postId: string) => {
      try {
        await postsApi.fixStuckPost(postId);
        // Refresh the posts list
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
        alert("Post fixed! Status updated.");
      } catch (error) {
        console.error("Failed to fix stuck post:", error);
        alert("Failed to fix stuck post. Please try again.");
      }
    },
    [fetchPosts, selectedStatus, page, selectedAccountId]
  );

  const handlePostRecovered = useCallback(
    (_post: Post) => {
      // Refetch the list after recovery - the post parameter tells us which post was recovered
      fetchPosts(
        selectedStatus || undefined,
        page,
        undefined,
        selectedAccountId || undefined
      );
    },
    [fetchPosts, selectedStatus, page, selectedAccountId]
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

      try {
        console.log("🎯 PostsList: Schedule submitted");
        console.log(`   Post ID: ${schedulingPostId}`);
        console.log(`   Config:`, config);
        console.log(`   Account ID: ${currentAccountId || "ALL ACCOUNTS"}`);

        // ✅ NEW: Multi-account scheduling support
        if (!currentAccountId && credentials.length > 1) {
          // No account selected = schedule to ALL accounts
          console.log(`📅 Scheduling to ALL ${credentials.length} accounts`);
          
          const accountIds = credentials.map((c) => c.id);
          const result = await postsApi.scheduleToMultipleAccounts(
            schedulingPostId,
            {
              pattern: config.pattern,
              scheduledAt: config.scheduledAt,
              daysOfWeek: config.daysOfWeek,
              dayOfMonth: config.dayOfMonth,
              endDate: config.endDate,
              time: config.time,
            },
            accountIds
          );

          console.log(`✅ Multi-account schedule success: ${result.posts.length} posts created`);
          alert(
            `✅ Scheduled ${result.posts.length} posts to ${accountIds.length} accounts!`
          );
        } else {
          // Single account scheduling (existing behavior)
          if (!currentAccountId) {
            alert("Please select an account to schedule for");
            return;
          }

          await schedulePost(schedulingPostId, config, [currentAccountId]);
          console.log("✅ PostsList: Schedule API success");
        }

        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
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
      credentials,
    ]
  );

  const handleCancel = useCallback(
    async (postId: string) => {
      try {
        await cancelSchedule(postId);
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
      } catch (error) {
        console.error("Failed to cancel schedule:", error);
        alert("Failed to cancel schedule. Please try again.");
      }
    },
    [cancelSchedule, fetchPosts, selectedStatus, page, selectedAccountId]
  );

  // Handlers - Edit Modal
  const handleEditPost = useCallback((post: Post) => {
    setEditingPost(post);
    setShowEditModal(true);
  }, []);

  // Handlers - Post Management
  const handleNewPost = useCallback(async () => {
    try {
      // Create empty post associated with selected account
      const newPostData: Partial<Post> = {
        content: "",
        postType: "TEXT",
        imageUrls: [],
        threadsAccountId: selectedAccountId || undefined,
      };

      const newPost = await createPost(newPostData);
      setEditingPost(newPost);
      setShowEditModal(true);
    } catch (error) {
      console.error("Failed to create new post:", error);
      alert("Failed to create new post. Please try again.");
    }
  }, [createPost, selectedAccountId]);

  const handleSavePost = useCallback(
    async (updatedPost: Partial<Post>) => {
      if (!editingPost) return;

      if (editingPost._id.startsWith("new-")) {
        // New post - use createPost (it's already created, so update it)
        await updatePost(editingPost._id, updatedPost);
      } else {
        // Existing post - update
        await updatePost(editingPost._id, updatedPost);
      }

      setShowEditModal(false);
      setEditingPost(null);
      await fetchPosts(
        selectedStatus || undefined,
        page,
        undefined,
        selectedAccountId || undefined
      );
    },
    [
      editingPost,
      updatePost,
      fetchPosts,
      selectedStatus,
      page,
      selectedAccountId,
    ]
  );

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingPost(null);
  }, []);

  // Handlers - Pagination
  const handlePageChange = useCallback(
    (newPage: number) => {
      fetchPosts(
        selectedStatus || undefined,
        newPage,
        undefined,
        selectedAccountId || undefined
      );
    },
    [fetchPosts, selectedStatus]
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      setLimit(newSize);
      fetchPosts(
        selectedStatus || undefined,
        0,
        newSize,
        selectedAccountId || undefined
      );
    },
    [fetchPosts, selectedStatus, setLimit, selectedAccountId]
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

  // Handler for duplicating post to other accounts
  const handleDuplicateToAccount = useCallback(
    async (postId: string, targetAccountId: string) => {
      try {
        const result = await postsApi.duplicatePost(postId, [targetAccountId]);
        alert(
          `Successfully duplicated post to ${result.duplicatedPosts.length} account(s)`
        );
        await fetchPosts(
          selectedStatus || undefined,
          page,
          undefined,
          selectedAccountId || undefined
        );
      } catch (error) {
        console.error("Failed to duplicate post:", error);
        alert("Failed to duplicate post. Please try again.");
      }
    },
    [fetchPosts, selectedStatus, page, selectedAccountId]
  );

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
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleNewPost}
              disabled={!selectedAccountId || credentials.length === 0}
              title={
                !selectedAccountId
                  ? "Please select a specific account to create a new post"
                  : credentials.length === 0
                  ? "No accounts available"
                  : "Create new post"
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              New Post
            </Button>
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

        {/* Quick Account Switcher */}
        {credentials.length > 1 && (
          <div className="mt-4 pb-4 border-b">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {/* All Accounts Button */}
              <Button
                variant={!selectedAccountId ? "default" : "outline"}
                size="sm"
                className="flex items-center gap-2 whitespace-nowrap"
                onClick={() => setSelectedAccount("")}
              >
                <Users className="h-4 w-4" />
                All
                {postCountsByAccount["all"] !== undefined && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                      !selectedAccountId
                        ? "bg-white text-blue-600"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {postCountsByAccount["all"]}
                  </span>
                )}
              </Button>

              {/* Individual Account Tabs */}
              {credentials.map((account) => (
                <Button
                  key={account.id}
                  variant={
                    selectedAccountId === account.id ? "default" : "outline"
                  }
                  size="sm"
                  className="flex items-center gap-2 whitespace-nowrap"
                  onClick={() => setSelectedAccount(account.id)}
                >
                  <UserCircle className="h-4 w-4" />
                  {account.accountName || account.threadsUserId}
                  {postCountsByAccount[account.id] !== undefined && (
                    <span
                      className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                        selectedAccountId === account.id
                          ? "bg-white text-blue-600"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {postCountsByAccount[account.id]}
                    </span>
                  )}
                  {account.isDefault && (
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 ml-1" />
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Account & Type Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Account Selector Dropdown */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Account</label>
            <Select
              value={selectedAccountId || "all-accounts"}
              onValueChange={(id) =>
                setSelectedAccount(id === "all-accounts" ? "" : id)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-accounts">All Accounts</SelectItem>
                {credentials.map((cred) => (
                  <SelectItem key={cred.id} value={cred.id}>
                    {cred.accountName || cred.threadsUserId}{" "}
                    {cred.isDefault ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Post Type Dropdown */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Post Type</label>
            <Select
              value={postTypeFilter || "all-types"}
              onValueChange={(type) =>
                setPostTypeFilter(type === "all-types" ? "" : type)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All Types</SelectItem>
                {Object.values(PostType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {credentials.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              <p className="text-lg font-medium">No accounts available</p>
              <p className="text-sm mt-2">
                Add a Threads account in the Settings to manage your posts
              </p>
            </div>
          </div>
        ) : loading && page === 0 ? (
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
              onDuplicateToAccount={handleDuplicateToAccount}
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
