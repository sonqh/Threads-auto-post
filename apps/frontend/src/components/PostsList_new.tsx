import { format } from "date-fns";
import { Download } from "lucide-react";
import React, { useEffect, useState } from "react";
import { usePostList, useThreadsPublish } from "../hooks";
import { PostsHeader } from "./PostsHeader";
import { PostsTable } from "./PostsTable";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { PostStatus, type Post, type PostStatusType } from "@/types";
import { LinksModal } from "./LinksModal";

export const PostsList: React.FC = () => {
  const { posts, loading, fetchPosts, deletePost, bulkDelete } = usePostList();
  const { publish, schedulePost, cancelSchedule, publishing } =
    useThreadsPublish();

  const [selectedStatus, setSelectedStatus] = useState<PostStatusType | "">("");
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [linksModalPost, setLinksModalPost] = useState<Post | null>(null);

  // Load posts on mount and when filters change
  useEffect(() => {
    fetchPosts(selectedStatus || undefined);
  }, [selectedStatus, fetchPosts]);

  const handleSelectPost = (id: string) => {
    const newSelected = new Set(selectedPosts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPosts(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedPosts(new Set(posts.map((p) => p._id)));
    } else {
      setSelectedPosts(new Set());
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      await bulkDelete(ids);
      setSelectedPosts(new Set());
    } catch (error) {
      console.error("Failed to delete posts:", error);
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await deletePost(id);
    } catch (error) {
      console.error("Failed to delete post:", error);
    }
  };

  const handlePublish = async (postId: string) => {
    const post = posts.find((p) => p._id === postId);
    if (!post) return;

    if (!confirm("Publish this post to Threads now?")) return;

    try {
      await publish(postId, post);
      await fetchPosts(selectedStatus || undefined);
    } catch (error) {
      console.error("Failed to publish:", error);
    }
  };

  const handleSchedule = async (postId: string) => {
    const scheduledAtStr = prompt(
      "Enter scheduled time (e.g., 2024-01-01T12:00:00)"
    );
    if (!scheduledAtStr) return;

    try {
      await schedulePost(postId, new Date(scheduledAtStr));
      await fetchPosts(selectedStatus || undefined);
    } catch (error) {
      console.error("Failed to schedule:", error);
    }
  };

  const handleCancel = async (postId: string) => {
    try {
      await cancelSchedule(postId);
      await fetchPosts(selectedStatus || undefined);
    } catch (error) {
      console.error("Failed to cancel schedule:", error);
    }
  };

  const handleBulkSchedule = async (ids: string[], scheduledAt: Date) => {
    try {
      for (const id of ids) {
        await schedulePost(id, scheduledAt);
      }
      setSelectedPosts(new Set());
      await fetchPosts(selectedStatus || undefined);
    } catch (error) {
      console.error("Failed to schedule posts:", error);
    }
  };

  const handleEditPost = (post: Post) => {
    // TODO: Implement edit modal
    console.log("Edit post:", post);
  };

  const exportToCSV = () => {
    const csv = [
      ["Content", "Type", "Status", "Topic", "Links", "Scheduled"],
      ...posts.map((p) => [
        p.content,
        p.postType,
        p.status,
        p.topic || "",
        p.imageUrls.length,
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
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Posts</CardTitle>
            <CardDescription>Manage your Threads posts</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 mt-4">
          {["" as const, ...Object.values(PostStatus)].map((status) => (
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
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading posts...
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
          </>
        )}

        {/* Links Modal */}
        {showLinksModal && linksModalPost && (
          <LinksModal
            post={linksModalPost}
            onClose={() => {
              setShowLinksModal(false);
              setLinksModalPost(null);
            }}
            onSave={(links) => {
              // Update post with new links
              console.log("Save links:", links);
              setShowLinksModal(false);
              setLinksModalPost(null);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
};
