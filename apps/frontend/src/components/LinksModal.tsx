import { useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Trash2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Post } from "@/types";

interface LinksModalProps {
  post: Post;
  onClose: () => void;
  onSave: (links: string[]) => void;
}

export const LinksModal = ({ post, onClose, onSave }: LinksModalProps) => {
  const [links, setLinks] = useState<string[]>(post.imageUrls || []);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateLink = (index: number, url: string) => {
    const newErrors = { ...errors };
    if (url.trim() && !isValidUrl(url)) {
      newErrors[index] = "Invalid URL format";
    } else {
      delete newErrors[index];
    }
    setErrors(newErrors);
  };

  const handleUpdateLink = (index: number, value: string) => {
    const newLinks = [...links];
    newLinks[index] = value;
    setLinks(newLinks);
    validateLink(index, value);
  };

  const handleAddLink = () => {
    setLinks([...links, ""]);
  };

  const handleRemoveLink = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index);
    setLinks(newLinks);
    const newErrors = { ...errors };
    delete newErrors[index];
    setErrors(newErrors);
  };

  const handleSave = () => {
    const validLinks = links.filter((link) => isValidUrl(link));
    if (validLinks.length === 0) {
      alert("Please add at least one valid URL");
      return;
    }
    onSave(validLinks);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4">
        <CardHeader>
          <CardTitle>Edit Media Links</CardTitle>
          <CardDescription>
            Add or edit image/video URLs for your post
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-h-96 overflow-y-auto">
          {links.map((link, index) => (
            <div key={index} className="space-y-2">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    type="text"
                    value={link}
                    onChange={(e) => handleUpdateLink(index, e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRemoveLink(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {errors[index] && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {errors[index]}
                </div>
              )}
              {link && !errors[index] && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Valid URL
                </div>
              )}
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={handleAddLink}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Link
          </Button>
        </CardContent>

        <div className="flex gap-2 p-6 border-t">
          <Button onClick={handleSave} className="flex-1">
            Save Links
          </Button>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
};
