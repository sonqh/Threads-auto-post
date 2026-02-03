import { format } from "date-fns";
import {
  Calendar,
  Edit2,
  Play,
  Square,
  Trash2,
  Zap,
  MoreVertical,
  Copy,
  UserCircle2,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { TableCell, TableRow as TableRowComponent } from "./ui/table";
import { ProgressSpinner } from "./ProgressSpinner";
import { StuckPostRecoveryModal } from "./StuckPostRecoveryModal";
import type { Post, PostStatusType } from "@/types";
import type { StoredCredential } from "@/hooks/useCredentials";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./ui/dropdown-menu";

interface PostRowProps {
  post: Post;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (post: Post) => void;
  onPublish: (postId: string) => void;
  onSchedule: (postId: string) => void;
  onCancel: (postId: string) => void;
  onDelete: (postId: string) => void;
  onFixStuck?: (postId: string) => void;
  onPostRecovered?: (post: Post) => void;
  onDuplicateToAccount?: (postId: string, targetAccountId: string) => void;
  publishing?: boolean;
  credentials?: StoredCredential[];
}

export const PostRow: React.FC<PostRowProps> = ({
  post,
  selected,
  onSelect,
  onEdit,
  onPublish,
  onSchedule,
  onCancel,
  onDelete,
  onFixStuck,
  onPostRecovered,
  onDuplicateToAccount,
  publishing = false,
  credentials,
}) => {
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [isStuckPublishing, setIsStuckPublishing] = useState(false);

  // Enhanced status badge with modern design
  const getStatusBadge = (status: PostStatusType): string => {
    const baseClasses =
      "px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all";

    switch (status) {
      case "DRAFT":
        return `${baseClasses} bg-gray-100 text-gray-700 border border-gray-200`;
      case "SCHEDULED":
        return `${baseClasses} bg-blue-50 text-blue-700 border border-blue-200`;
      case "PUBLISHING":
        return `${baseClasses} bg-yellow-50 text-yellow-700 border border-yellow-200 animate-pulse`;
      case "PUBLISHED":
        return `${baseClasses} bg-green-50 text-green-700 border border-green-200`;
      case "FAILED":
        return `${baseClasses} bg-red-50 text-red-700 border border-red-200`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-700 border border-gray-200`;
    }
  };

  // Get status icon
  const getStatusIcon = (status: PostStatusType) => {
    switch (status) {
      case "DRAFT":
        return "📝";
      case "SCHEDULED":
        return "📅";
      case "PUBLISHING":
        return "🚀";
      case "PUBLISHED":
        return "✅";
      case "FAILED":
        return "❌";
      default:
        return "📄";
    }
  };

  // Get account name from account ID or default account
  const getAccountName = () => {
    if (!credentials || credentials.length === 0) {
      return "No Account";
    }

    // If post has a specific account ID, find and return it
    if (post.threadsAccountId) {
      const account = credentials.find((c) => c.id === post.threadsAccountId);
      return account?.accountName || "Unknown Account";
    }

    // If no account ID, find and return the default account
    const defaultAccount = credentials.find((c) => c.isDefault);
    if (defaultAccount) {
      return defaultAccount.accountName;
    }

    // Fallback to first account if no default found
    return credentials[0]?.accountName || "No Account";
  };

  const canPublish = post.status === "DRAFT";
  const canSchedule = post.status === "DRAFT";
  const canCancel = post.status === "SCHEDULED";

  // Check if post is stuck in PUBLISHING (more than 2 minutes)
  // Use useEffect to avoid calling impure Date.now() during render
  useEffect(() => {
    const checkStuckStatus = () => {
      if (post.status === "PUBLISHING" && post.publishingProgress?.startedAt) {
        const timeElapsed =
          Date.now() - new Date(post.publishingProgress.startedAt).getTime();
        setIsStuckPublishing(timeElapsed > 2 * 60 * 1000);
      } else {
        setIsStuckPublishing(false);
      }
    };

    checkStuckStatus();
    // Recheck every 10 seconds to keep status updated
    const interval = setInterval(checkStuckStatus, 10000);

    return () => clearInterval(interval);
  }, [post.status, post.publishingProgress?.startedAt]);

  const handleOpenRecoveryModal = () => {
    setShowRecoveryModal(true);
  };

  const handleRecovered = (recoveredPost: Post) => {
    setShowRecoveryModal(false);
    if (onPostRecovered) {
      onPostRecovered(recoveredPost);
    }
  };

  return (
    <>
      <TableRowComponent>
        <TableCell className="sticky left-0 z-10 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
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
          {/* Compact Status Badge */}
          <div className="flex items-center gap-2">
            <span className={getStatusBadge(post.status as PostStatusType)}>
              <span className="text-sm">
                {getStatusIcon(post.status as PostStatusType)}
              </span>
              <span>{post.status}</span>
            </span>

            {/* Compact Progress Indicator (Publishing only) */}
            {post.status === "PUBLISHING" && post.publishingProgress && (
              <div
                className="flex items-center gap-1.5"
                title={post.publishingProgress.currentStep || "Publishing..."}
              >
                <ProgressSpinner
                  isActive={true}
                  currentStep={post.publishingProgress.currentStep}
                  size="sm"
                />
                {post.publishingProgress.startedAt && (
                  <span className="text-xs text-gray-400">
                    {Math.floor(
                      (Date.now() -
                        new Date(post.publishingProgress.startedAt).getTime()) /
                        1000,
                    )}
                    s
                  </span>
                )}
              </div>
            )}

            {/* Compact Error Indicator (Failed only) */}
            {post.status === "FAILED" && post.error && (
              <div
                title={post.error}
                className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center cursor-help border border-red-300"
              >
                <span className="text-xs font-bold text-red-600">!</span>
              </div>
            )}

            {/* Stuck Warning (compact) */}
            {isStuckPublishing && (
              <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200 font-semibold">
                ⚠️
              </span>
            )}
          </div>
        </TableCell>

        <TableCell>
          <span className="text-sm text-gray-600">{post.postType}</span>
        </TableCell>

        <TableCell>
          <span className="text-sm font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded">
            {getAccountName()}
          </span>
        </TableCell>

        <TableCell>
          {post.imageUrls && post.imageUrls.length > 0 ? (
            <span className="text-sm text-gray-700 font-medium">
              {post.imageUrls.length}{" "}
              {post.imageUrls.length === 1 ? "link" : "links"}
            </span>
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

        <TableCell className="text-right sticky right-0 z-10 bg-white shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
          <div className="flex gap-1 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(post)}
              className="h-8 w-8 p-0"
            >
              <Edit2 className="h-4 w-4" />
            </Button>

            {/* Duplicate to Account Dropdown */}
            {onDuplicateToAccount && credentials && credentials.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="More actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate to Account...
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {credentials
                        .filter((c) => c.id !== post.threadsAccountId)
                        .map((account) => (
                          <DropdownMenuItem
                            key={account.id}
                            onClick={() =>
                              onDuplicateToAccount(post._id, account.id)
                            }
                          >
                            <UserCircle2 className="h-4 w-4 mr-2" />
                            {account.accountName || account.threadsUserId}
                          </DropdownMenuItem>
                        ))}
                      {credentials.filter((c) => c.id !== post.threadsAccountId)
                        .length === 0 && (
                        <DropdownMenuItem disabled>
                          No other accounts available
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {isStuckPublishing && onFixStuck && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenRecoveryModal}
                className="h-8 w-8 p-0 text-yellow-600 hover:text-yellow-700"
                title="Check and recover stuck publishing post"
              >
                <Zap className="h-4 w-4" />
              </Button>
            )}

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

      {/* Recovery Modal - rendered as portal */}
      {showRecoveryModal && (
        <StuckPostRecoveryModal
          post={post}
          onClose={() => setShowRecoveryModal(false)}
          onRecovered={handleRecovered}
        />
      )}
    </>
  );
};
