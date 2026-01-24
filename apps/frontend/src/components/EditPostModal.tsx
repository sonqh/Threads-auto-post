import { PostStatus, type Post, type PostStatusType } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  X,
  Plus,
  Link as LinkIcon,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { TagInput } from "./TagInput";
import type { StoredCredential } from "@/hooks/useCredentials";

interface EditPostModalProps {
  post: Post;
  onClose: () => void;
  onSave: (updatedPost: Partial<Post>) => Promise<void>;
  credentials?: StoredCredential[];
}

// Sanitize and validate image URLs
const sanitizeImageUrls = (urls: string[] | undefined): string[] => {
  if (!Array.isArray(urls)) return [];
  return urls.filter((url) => typeof url === "string" && url.trim().length > 0);
};

export const EditPostModal: React.FC<EditPostModalProps> = ({
  post,
  onClose,
  onSave,
  credentials,
}) => {
  const [content, setContent] = useState(post.content);
  const [topicTags, setTopicTags] = useState<string[]>(
    post.topic ? post.topic.split(",").map((t) => t.trim()) : []
  );
  const [description, setDescription] = useState(post.comment || "");
  const [status, setStatus] = useState<PostStatusType>(
    post.status as PostStatusType
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    post.threadsAccountId || ""
  );

  // Link management - validate file paths and URLs on load
  const [links, setLinks] = useState<string[]>(
    sanitizeImageUrls(post.imageUrls)
  );
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [linkErrors, setLinkErrors] = useState<Record<number, string>>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate all links - accept both file paths and URLs
  const linkValidation = useMemo(() => {
    const errors = links.filter(link => !link.trim()).length;
    return { valid: errors === 0 };
  }, [links]);

  const handleValidateLinkUrl = (index: number, url: string) => {
    const newErrors = { ...linkErrors };

    // Allow both file paths and URLs
    if (!url.trim()) {
      newErrors[index] = "Path is required";
    } else {
      // File path or URL - just check if it's not empty
      delete newErrors[index];
    }

    setLinkErrors(newErrors);
  };

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) {
      setError("File path or URL is required");
      return;
    }

    setLinks([...links, newLinkUrl.trim()]);
    setNewLinkUrl("");
    setError(null);
  };

  const handleUpdateLinkUrl = (index: number, url: string) => {
    const newLinks = [...links];
    newLinks[index] = url;
    setLinks(newLinks);
    handleValidateLinkUrl(index, url);
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
    const newErrors = { ...linkErrors };
    delete newErrors[index];
    setLinkErrors(newErrors);
  };

  const handleSave = async () => {
    if (!content.trim()) {
      setError("Content is required");
      return;
    }

    if (!linkValidation.valid && links.length > 0) {
      setError("Please fix all link validation errors");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        content: content.trim(),
        topic: topicTags.length > 0 ? topicTags.join(", ") : undefined,
        comment: description.trim() || undefined,
        status,
        imageUrls: links,
        threadsAccountId: selectedAccountId || undefined,
      });
      // Success - modal will be closed by parent
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Edit Post</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Content */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full px-3 py-2 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter post content..."
              maxLength={500}
            />
            <div className="text-xs text-gray-500 mt-1 text-right">
              {content.length}/500 characters
            </div>
          </div>

          {/* Topic Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">Topics</label>
            <TagInput
              tags={topicTags}
              onTagsChange={setTopicTags}
              placeholder="Add topic (e.g., #technology) and press Enter"
              maxTags={5}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add post description (optional)"
              maxLength={300}
            />
            <div className="text-xs text-gray-500 mt-1 text-right">
              {description.length}/300 characters
            </div>
          </div>

          {/* Account Selector */}
          {post.status === "DRAFT" && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Threads Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                disabled={!credentials || credentials.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Default Account</option>
                {credentials?.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    {cred.accountName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={status}
              onChange={(e) => setStatus(e.target.value as PostStatusType)}
            >
              <option value={PostStatus.DRAFT}>Draft</option>
              <option value={PostStatus.SCHEDULED}>Scheduled</option>
              <option value={PostStatus.PUBLISHED}>Published</option>
              <option value={PostStatus.FAILED}>Failed</option>
            </select>
          </div>

          {/* Images */}
          <div>
            <label className="block text-sm font-medium mb-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Images ({links.length})
              </div>
            </label>

            {/* Images Summary */}
            {links.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  📋 Images Overview:
                </p>
                <div className="space-y-1">
                  {links.map((link, index) => {
                    const isValid = !linkErrors[index];
                    const filename = link.split('/').pop() || link;
                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-2 px-2 py-1 text-xs rounded transition-colors truncate ${isValid
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                          }`}
                        title={link}
                      >
                        {isValid ? (
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        )}
                        <span className="truncate">Image {index + 1}: {filename}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Existing Images - Detailed View */}
            <div className="space-y-2 mb-4">
              {links.map((link, index) => (
                <div
                  key={index}
                  className={`p-3 border rounded-lg transition-colors ${linkErrors[index]
                    ? "bg-red-50 border-red-200"
                    : "bg-green-50 border-green-200"
                    }`}
                >
                  {/* Image Status Badge */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                        Image {index + 1}
                      </span>
                      {!linkErrors[index] ? (
                        <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          Valid
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-700 font-medium">
                          <AlertCircle className="h-3 w-3" />
                          Invalid
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveLink(index)}
                      className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Image Path Input */}
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={link}
                      onChange={(e) =>
                        handleUpdateLinkUrl(index, e.target.value)
                      }
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:border-transparent font-mono text-xs ${linkErrors[index]
                        ? "border-red-300 focus:ring-red-500 bg-red-50"
                        : "border-green-300 focus:ring-green-500 bg-green-50"
                        }`}
                      placeholder="/path/to/image.webp or https://example.com/image.jpg"
                    />
                  </div>

                  {/* Validation Feedback */}
                  {linkErrors[index] && (
                    <div className="mt-2 flex items-start gap-2 text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="text-xs">{linkErrors[index]}</span>
                    </div>
                  )}
                  {!linkErrors[index] && link && (
                    <div className="mt-2 flex items-start gap-2 text-green-700">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="text-xs">
                        {link.startsWith('/') ? 'Local file path' : 'URL'} is valid
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Image */}
            <div className="p-3 border-2 border-dashed border-gray-300 rounded-lg space-y-2">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Add New Image
                </label>
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="/absolute/path/to/image.webp or https://example.com/image.jpg"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newLinkUrl.trim()) {
                      e.preventDefault();
                      handleAddLink();
                    }
                  }}
                />
              </div>

              <Button
                onClick={handleAddLink}
                disabled={!newLinkUrl.trim()}
                className="w-full"
                type="button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Image
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={saving || !linkValidation.valid}
              className="flex-1"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
