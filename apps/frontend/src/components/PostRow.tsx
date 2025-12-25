import { PostStatus, type Post, type PostStatusType } from "@/types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface PostRowProps {
  post: Post;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (post: Post) => void;
  onPublish: (postId: string) => void;
  onSchedule: (postId: string) => void;
  onCancel: (postId: string) => void;
  onDelete: (postId: string) => void;
  publishing?: boolean;
}

export const PostRow = ({
  post,
  selected,
  onSelect,
  onEdit,
  onPublish,
  onSchedule,
  onCancel,
  onDelete,
  publishing,
}: PostRowProps) => {
  const getStatusColor = (status: PostStatusType) => {
    switch (status) {
      case PostStatus.DRAFT:
        return "bg-gray-100 text-gray-800";
      case PostStatus.SCHEDULED:
        return "bg-blue-100 text-blue-800";
      case PostStatus.PUBLISHED:
        return "bg-green-100 text-green-800";
      case PostStatus.FAILED:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const truncateText = (text: string, length: number) => {
    return text.length > length ? text.substring(0, length) + "..." : text;
  };

  return (
    <Card className="p-4 border-l-4" key={post._id}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(post._id)}
              className="w-4 h-4"
            />
            <span
              className={`px-2 py-1 rounded text-sm font-medium ${getStatusColor(
                post.status as PostStatusType
              )}`}
            >
              {post.status}
            </span>
            <span className="text-sm text-gray-600">{post.postType}</span>
          </div>
          <p className="text-sm text-gray-700 mb-2">
            {truncateText(post.content, 100)}
          </p>
          {post.imageUrls && post.imageUrls.length > 0 && (
            <p className="text-xs text-gray-500 mb-2">
              {post.imageUrls.length} media item(s)
            </p>
          )}
          <p className="text-xs text-gray-500">
            Created: {new Date(post.createdAt).toLocaleDateString()}
            {post.scheduledAt &&
              ` • Scheduled: ${new Date(post.scheduledAt).toLocaleString()}`}
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {(post.status as PostStatusType) === PostStatus.DRAFT && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => onPublish(post._id)}
                disabled={publishing}
              >
                {publishing ? "Publishing..." : "Publish"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSchedule(post._id)}
              >
                Schedule
              </Button>
            </>
          )}

          {(post.status as PostStatusType) === PostStatus.SCHEDULED && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(post._id)}
            >
              Cancel
            </Button>
          )}

          {(post.status as PostStatusType) === PostStatus.PUBLISHED &&
            post.threadsPostId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  window.open(
                    `https://threads.net/${post.threadsPostId}`,
                    "_blank"
                  )
                }
              >
                View
              </Button>
            )}

          {(post.status as PostStatusType) === PostStatus.FAILED && (
            <>
              <Button size="sm" variant="outline" onClick={() => onEdit(post)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => onPublish(post._id)}
              >
                Retry
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDelete(post._id)}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
};
