import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface PostsHeaderProps {
  selectedCount: number;
  onSelectAll: (selected: boolean) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkSchedule: (ids: string[], scheduledAt: Date) => void;
  selectedIds: string[];
}

export const PostsHeader = ({
  selectedCount,
  onSelectAll,
  onBulkDelete,
  onBulkSchedule,
  selectedIds,
}: PostsHeaderProps) => {
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const handleSchedule = () => {
    if (!scheduledAt) return;
    onBulkSchedule(selectedIds, new Date(scheduledAt));
    setScheduledAt("");
    setShowScheduleModal(false);
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selectedCount > 0}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium">
            {selectedCount > 0 ? `${selectedCount} selected` : "Select posts"}
          </span>
        </div>

        {selectedCount > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowScheduleModal(true)}
            >
              Schedule {selectedCount}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete ${selectedCount} post(s)?`)) {
                  onBulkDelete(selectedIds);
                }
              }}
            >
              Delete {selectedCount}
            </Button>
          </div>
        )}
      </div>

      {showScheduleModal && (
        <div className="border-t pt-4 space-y-3">
          <label className="block text-sm font-medium">Schedule for:</label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSchedule} disabled={!scheduledAt}>
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowScheduleModal(false);
                setScheduledAt("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
