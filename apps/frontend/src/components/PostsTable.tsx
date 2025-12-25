import type { Post } from "@/types";
import { PostRow } from "./PostRow";

interface PostsTableProps {
  posts: Post[];
  selectedIds: Set<string>;
  onSelectPost: (id: string) => void;
  onEditPost: (post: Post) => void;
  onPublish: (postId: string) => void;
  onSchedule: (postId: string) => void;
  onCancel: (postId: string) => void;
  onDelete: (postId: string) => void;
  publishingIds?: Set<string>;
}

export const PostsTable = ({
  posts,
  selectedIds,
  onSelectPost,
  onEditPost,
  onPublish,
  onSchedule,
  onCancel,
  onDelete,
  publishingIds,
}: PostsTableProps) => {
  return (
    <div className="space-y-3">
      {posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No posts found</p>
        </div>
      ) : (
        posts.map((post) => (
          <PostRow
            key={post._id}
            post={post}
            selected={selectedIds.has(post._id)}
            onSelect={onSelectPost}
            onEdit={onEditPost}
            onPublish={onPublish}
            onSchedule={onSchedule}
            onCancel={onCancel}
            onDelete={onDelete}
            publishing={publishingIds?.has(post._id)}
          />
        ))
      )}
    </div>
  );
};
