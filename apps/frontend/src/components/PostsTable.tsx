import type { Post } from "@/types";
import { PostRow } from "./PostRow";
import { Checkbox } from "./ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow as TableRowComponent,
} from "./ui/table";
import type { StoredCredential } from "@/hooks/useCredentials";

interface PostsTableProps {
  posts: Post[];
  selectedIds: Set<string>;
  onSelectPost: (id: string) => void;
  onEditPost: (post: Post) => void;
  onPublish: (postId: string) => void;
  onSchedule: (postId: string) => void;
  onCancel: (postId: string) => void;
  onDelete: (postId: string) => void;
  onFixStuck?: (postId: string) => void;
  onPostRecovered?: (post: Post) => void;
  onDuplicateToAccount?: (postId: string, targetAccountId: string) => void;
  publishingIds?: Set<string>;
  credentials?: StoredCredential[];
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
  onFixStuck,
  onPostRecovered,
  onDuplicateToAccount,
  publishingIds,
  credentials,
}: PostsTableProps) => {
  const allSelected = posts.length > 0 && selectedIds.size === posts.length;

  const handleSelectAll = () => {
    posts.forEach((post) => {
      if (!allSelected && !selectedIds.has(post._id)) {
        onSelectPost(post._id);
      } else if (allSelected && selectedIds.has(post._id)) {
        onSelectPost(post._id);
      }
    });
  };

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No posts found</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRowComponent>
          <TableHead className="w-12">
            <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
          </TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Links</TableHead>
          <TableHead>Comment</TableHead>
          <TableHead>Scheduled</TableHead>
          <TableHead>Topic</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRowComponent>
      </TableHeader>
      <TableBody>
        {posts.map((post) => (
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
            onFixStuck={onFixStuck}
            onPostRecovered={onPostRecovered}
            onDuplicateToAccount={onDuplicateToAccount}
            publishing={publishingIds?.has(post._id)}
            credentials={credentials}
          />
        ))}
      </TableBody>
    </Table>
  );
};
