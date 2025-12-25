import { format } from "date-fns";
import { Calendar, Edit2, Play, Square, Trash2 } from "lucide-react";
import React from "react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { TableCell, TableRow as TableRowComponent } from "./ui/table";
import type { Post, PostStatusType } from "@/types";

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

const getStatusBadge = (status: PostStatusType) => {
  const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";

  switch (status) {
    case "DRAFT":
      return `${baseClasses} bg-gray-100 text-gray-800`;
    case "SCHEDULED":
      return `${baseClasses} bg-blue-100 text-blue-800`;
    case "PUBLISHED":
      return `${baseClasses} bg-green-100 text-green-800`;
    case "FAILED":
      return `${baseClasses} bg-red-100 text-red-800`;
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`;
  }
};

export const PostRow: React.FC<PostRowProps> = ({
  post,
  selected,
  onSelect,
  onEdit,
  onPublish,
  onSchedule,
  onCancel,
  onDelete,
  publishing = false,
}) => {
  const canPublish = post.status === "DRAFT";
  const canSchedule = post.status === "DRAFT";
  const canCancel = post.status === "SCHEDULED";

  return (
    <TableRowComponent>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(post._id)}
        />
      </TableCell>

      <TableCell>
        <div>
          <p className="text-sm font-medium line-clamp-2 max-w-xs">
            {post.content.length > 100
              ? `${post.content.substring(0, 100)}...`
              : post.content}
          </p>
          {post.imageUrls && post.imageUrls.length > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {post.imageUrls.length} image
              {post.imageUrls.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </TableCell>

      <TableCell>
        <span className={getStatusBadge(post.status as PostStatusType)}>
          {post.status}
        </span>
      </TableCell>

      <TableCell>
        <span className="text-sm text-gray-600">{post.postType}</span>
      </TableCell>

      <TableCell>
        {post.imageUrls && post.imageUrls.length > 0 ? (
          <div className="text-xs text-gray-600">
            {post.imageUrls.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate max-w-[150px] hover:text-blue-600"
                title={url}
              >
                Link {idx + 1}
              </a>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        )}
      </TableCell>

      <TableCell>
        {post.comment ? (
          <p
            className="text-xs text-gray-600 line-clamp-2 max-w-[150px]"
            title={post.comment}
          >
            {post.comment}
          </p>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        )}
      </TableCell>

      <TableCell>
        {post.scheduledAt ? (
          <span className="text-sm text-gray-600">
            {format(new Date(post.scheduledAt), "MMM dd, HH:mm")}
          </span>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        )}
      </TableCell>

      <TableCell>
        <span className="text-sm text-gray-600">{post.topic || "-"}</span>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(post)}
            className="h-8 w-8 p-0"
          >
            <Edit2 className="h-4 w-4" />
          </Button>

          {canPublish && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPublish(post._id)}
              disabled={publishing}
              className="h-8 w-8 p-0"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}

          {canSchedule && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSchedule(post._id)}
              className="h-8 w-8 p-0"
            >
              <Calendar className="h-4 w-4" />
            </Button>
          )}

          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(post._id)}
              className="h-8 w-8 p-0"
            >
              <Square className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(post._id)}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRowComponent>
  );
};
